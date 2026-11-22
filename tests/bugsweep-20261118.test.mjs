import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { addItemsToBookmarks, ensureFeedFolder } from "../lib/bookmarks.js";
import { collectFeedLinksFromDocument, probeCommonFeedPaths } from "../lib/discovery.js";
import { exportAllFeedsToFolder, exportFeedToFolder } from "../lib/export.js";
import { parseOPML } from "../lib/opml.js";
import { fetchFeedAndParse } from "../lib/rss.js";

const originalFetch = globalThis.fetch;
const originalNow = Date.now;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  delete globalThis.chrome;
  delete globalThis.document;
  delete globalThis.location;
  delete globalThis.navigator;
  delete globalThis.window;
  delete globalThis.crypto;
});

function installStorage(initialState = {}) {
  const store = structuredClone(initialState);
  const storage = {
    local: {
      async get(keys) {
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, structuredClone(store[key])]));
        }
        if (typeof keys === "string") {
          return { [keys]: structuredClone(store[keys]) };
        }
        return structuredClone(store);
      },
      async set(patch) {
        for (const [key, value] of Object.entries(patch)) {
          store[key] = structuredClone(value);
        }
      }
    }
  };
  return { store, storage };
}

test("Bugsweep 2026-11-18 (1a): addItemsToBookmarks blocks non-HTTP(S) schemes and control-char URLs", async () => {
  const { store, storage } = installStorage({
    settings: {},
    feeds: { feedSec: { id: "feedSec", seen: {} } }
  });
  const created = [];

  globalThis.chrome = {
    storage,
    bookmarks: {
      async create(payload) {
        created.push(payload);
        return { id: `bm-${created.length}` };
      }
    }
  };

  const result = await addItemsToBookmarks(
    { id: "feedSec", seen: {} },
    "folder-sec",
    [
      { title: "XSS Bookmarklet", link: "javascript:alert(document.domain)", guid: "g-js" },
      { title: "Data Payload", link: "data:text/html,<script>alert(1)</script>", guid: "g-data" },
      { title: "Local File", link: "file:///C:/Windows/win.ini", guid: "g-file" },
      { title: "Control Char URL", link: "https://example.test/bad\r\nheader", guid: "g-ctrl" },
      { title: "Safe Entry", link: "https://example.test/articles/safe", guid: "g-safe" }
    ]
  );

  assert.equal(result.addedCount, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].url, "https://example.test/articles/safe");
  assert.ok("g-safe" in store.feeds.feedSec.seen);
});

test("Bugsweep 2026-11-18 (1b): addItemsToBookmarks persists seenDelta for already created items when bookmarks.create throws mid-batch", async () => {
  Date.now = () => 1_795_000_000_000;
  const { store, storage } = installStorage({
    settings: {},
    feeds: { feedBatch: { id: "feedBatch", seen: {} } }
  });
  let createCalls = 0;

  globalThis.chrome = {
    storage,
    bookmarks: {
      async create() {
        createCalls += 1;
        if (createCalls === 2) {
          throw new Error("Bookmark write failure on second item");
        }
        return { id: `bm-${createCalls}` };
      }
    }
  };

  await assert.rejects(
    () =>
      addItemsToBookmarks(
        { id: "feedBatch", seen: {} },
        "folder-batch",
        [
          { title: "First OK", link: "https://example.test/1", guid: "guid-1" },
          { title: "Second Boom", link: "https://example.test/2", guid: "guid-2" }
        ]
      ),
    /Bookmark write failure on second item/
  );

  assert.equal(
    store.feeds.feedBatch.seen["guid-1"],
    1_795_000_000_000,
    "already created item must be recorded in seen before error propagates"
  );
  assert.equal(store.feeds.feedBatch.seen["guid-2"], undefined);
});

test("Bugsweep 2026-11-18 (1c): ensureFeedFolder rejects bookmark leaf nodes when stored folder IDs point to URLs", async () => {
  const { store, storage } = installStorage({
    settings: { rootFolderName: "RSS", rootFolderId: "bookmark-leaf-root" },
    feeds: {}
  });
  const created = [];

  globalThis.chrome = {
    storage,
    bookmarks: {
      async get(id) {
        if (id === "bookmark-leaf-feed" || id === "bookmark-leaf-root") {
          return [{ id, title: "Leaf Bookmark", url: "https://example.test/leaf" }];
        }
        throw new Error("not found");
      },
      async getTree() {
        return [{
          id: "0",
          title: "",
          children: [{ id: "other", title: "Other bookmarks", children: [] }]
        }];
      },
      async getChildren() {
        return [];
      },
      async create(payload) {
        created.push(payload);
        return { id: created.length === 1 ? "real-root-folder" : "real-feed-folder" };
      }
    }
  };

  const folderId = await ensureFeedFolder(
    { title: "Security Feed", url: "https://example.test/rss.xml" },
    "bookmark-leaf-feed"
  );

  assert.equal(folderId, "real-feed-folder");
  assert.equal(store.settings.rootFolderId, "real-root-folder");
  assert.deepEqual(created, [
    { parentId: "other", title: "RSS" },
    { parentId: "real-root-folder", title: "Security Feed" }
  ]);
});

test("Bugsweep 2026-11-18 (2): .url export blocks CRLF INI injection & non-HTTP(S) URLs and disambiguates colliding file/folder names", async () => {
  const writes = [];

  function makeDirectory(folderName) {
    return {
      async getDirectoryHandle(name) {
        return makeDirectory(name);
      },
      async getFileHandle(fileName) {
        return {
          async createWritable() {
            return {
              async write(blob) {
                writes.push({ folderName, fileName, content: await blob.text() });
              },
              async close() {}
            };
          }
        };
      }
    };
  }

  globalThis.window = {
    async showDirectoryPicker() {
      return makeDirectory("root");
    }
  };

  globalThis.chrome = {
    bookmarks: {
      async getChildren(folderId) {
        if (folderId === "folder-sec") {
          return [
            { title: "SMB Leak", url: "https://example.test/p\r\nIconFile=\\\\evil.example\\share\\a.ico" },
            { title: "Script", url: "javascript:alert(1)" },
            { title: "Local", url: "file:///etc/passwd" },
            { title: "Weekly Digest", url: "https://example.test/digest-1" },
            { title: "weekly digest", url: "https://example.test/digest-2" }
          ];
        }
        if (folderId === "folder-dup") {
          return [{ title: "Only Entry", url: "https://example.test/other" }];
        }
        throw new Error("missing");
      }
    }
  };

  const singleExported = await exportFeedToFolder("folder-sec");
  assert.equal(singleExported, 2);
  assert.deepEqual(writes, [
    {
      folderName: "root",
      fileName: "Weekly Digest.url",
      content: "[InternetShortcut]\r\nURL=https://example.test/digest-1\r\n"
    },
    {
      folderName: "root",
      fileName: "weekly digest (2).url",
      content: "[InternetShortcut]\r\nURL=https://example.test/digest-2\r\n"
    }
  ]);

  writes.length = 0;
  const allExported = await exportAllFeedsToFolder([
    { title: "News: Tech", bookmarkFolderId: "folder-sec" },
    { title: "News/ Tech", bookmarkFolderId: "folder-dup" }
  ]);
  assert.equal(allExported, 3);
  assert.deepEqual(
    writes.map((w) => `${w.folderName}/${w.fileName}`),
    [
      "News_ Tech/Weekly Digest.url",
      "News_ Tech/weekly digest (2).url",
      "News_ Tech (2)/Only Entry.url"
    ]
  );
});

test("Bugsweep 2026-11-18 (3): feed discovery stays self-contained for executeScript, filters non-HTTP(S)/hash links, and skips non-HTTP(S) tab origins", async () => {
  globalThis.location = new URL("https://example.test/blog/index.html");
  globalThis.document = {
    querySelectorAll(selector) {
      if (selector === "link[href]") {
        return [
          {
            href: "data:application/rss+xml,<rss></rss>",
            title: "Data RSS",
            getAttribute(name) {
              if (name === "rel") return "alternate";
              if (name === "type") return "application/rss+xml";
              return "";
            }
          },
          {
            href: "https://example.test/feed.xml",
            title: "Main RSS",
            getAttribute(name) {
              if (name === "rel") return "alternate";
              if (name === "type") return "application/rss+xml";
              return "";
            }
          }
        ];
      }
      if (selector === "a[href]") {
        return [
          {
            href: "javascript:void(0)",
            title: "",
            textContent: "RSS",
            getAttribute(name) {
              return name === "href" ? "javascript:void(0)" : "";
            }
          },
          {
            href: "mailto:feed@example.test",
            title: "",
            textContent: "Feed",
            getAttribute(name) {
              return name === "href" ? "mailto:feed@example.test" : "";
            }
          },
          {
            href: "https://example.test/blog/index.html#rss",
            title: "",
            textContent: "RSS",
            getAttribute(name) {
              return name === "href" ? "#rss" : "";
            }
          }
        ];
      }
      return [];
    }
  };

  // Must execute cleanly when serialized in isolation just like chrome.scripting.executeScript
  const serializedRunner = new Function(`return (${collectFeedLinksFromDocument.toString()})();`);
  const domResult = serializedRunner();
  assert.deepEqual(domResult, {
    pageUrl: "https://example.test/blog/index.html",
    feeds: [{ url: "https://example.test/feed.xml", title: "Main RSS" }]
  });

  let probeCalls = 0;
  const fetchSpy = async () => {
    probeCalls += 1;
    return new Response("<rss></rss>", { status: 200 });
  };

  for (const internalUrl of [
    "chrome://extensions/",
    "edge://favorites/",
    "about:blank",
    "file:///C:/Users/Public/test.html"
  ]) {
    assert.deepEqual(await probeCommonFeedPaths(internalUrl, [], fetchSpy), []);
  }
  assert.equal(probeCalls, 0, "non-HTTP(S) tabs must not trigger 'null/...' network probes");
});

test("Bugsweep 2026-11-18 (4): RSS/Atom parser & OPML decode astral entities safely, resolve relative item links, and reject unsafe schemes", async () => {
  globalThis.fetch = async () =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Rocket &#128640; &amp; Star &#x1F31F; &#99999999; &#xD800;</title>
          <item>
            <title>Relative Post &#x1F680;</title>
            <link>/posts/hello-world</link>
            <guid>rel-1</guid>
          </item>
          <item>
            <title>Malicious Post</title>
            <link>javascript:alert(1)</link>
            <guid>bad-1</guid>
          </item>
        </channel>
      </rss>`,
      { status: 200 }
    );

  const rss = await fetchFeedAndParse("https://blog.example.test/feeds/rss.xml");
  assert.equal(rss.title, "Rocket 🚀 & Star 🌟 &#99999999; &#xD800;");
  assert.equal(rss.items[0].title, "Relative Post 🚀");
  assert.equal(rss.items[0].link, "https://blog.example.test/posts/hello-world");
  assert.equal(rss.items[1].link, "");

  globalThis.fetch = async () =>
    new Response(
      `<feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom &#x1F4DA;</title>
        <entry>
          <title>Trimmed Relative Atom</title>
          <id>atom-rel-1</id>
          <link rel="alternate" href="  ../entries/42  " />
        </entry>
      </feed>`,
      { status: 200 }
    );

  const atom = await fetchFeedAndParse("https://blog.example.test/sub/atom.xml");
  assert.equal(atom.title, "Atom 📚");
  assert.equal(atom.items[0].link, "https://blog.example.test/entries/42");

  const opmlFeeds = parseOPML(`<?xml version="1.0" encoding="UTF-8"?>
    <opml version="2.0">
      <body>
        <outline text="Books &#x1F4DA;" xmlUrl="https://books.example.test/feed.xml" />
        <outline text="XSS OPML" xmlUrl="javascript:alert(1)" />
        <outline text="Local OPML" xmlUrl="file:///etc/hosts" />
      </body>
    </opml>`);

  assert.deepEqual(opmlFeeds, [
    { url: "https://books.example.test/feed.xml", title: "Books 📚" }
  ]);
});

test("Bugsweep 2026-11-18 (5): options & popup UI reject non-HTTP(S) or duplicate feeds and clamp negative numeric settings", async () => {
  class FakeEl {
    constructor(id = "") {
      this.id = id;
      this.listeners = {};
      this.checked = false;
      this.value = "";
      this.files = [];
      this.className = "";
      this.dataset = {};
      this.type = "button";
      this.disabled = false;
      this.title = "";
      this.children = [];
      this._text = "";
      this._html = "";
    }
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    }
    async click() {
      if (this.listeners.click) await this.listeners.click({ target: this });
    }
    appendChild(child) {
      this.children.push(child);
    }
    querySelector() {
      return new FakeEl();
    }
    set textContent(v) {
      this._text = String(v ?? "");
      this._html = this._text;
    }
    get textContent() {
      return this._text;
    }
    set innerHTML(v) {
      this._html = String(v ?? "");
      this.children = [];
    }
    get innerHTML() {
      return this._html;
    }
  }

  const elements = new Map();
  for (const id of [
    "updateOnStartup",
    "globalInterval",
    "rootFolderName",
    "deleteBookmarks",
    "saveSettings",
    "refreshLifecycleBtn",
    "addBtn",
    "feedUrl",
    "importOPMLBtn",
    "opmlFileInput",
    "exportOPMLBtn",
    "exportAllFoldersBtn",
    "feedList",
    "lifecycleInfo",
    "settingsStatus",
    "feedStatus",
    "status",
    "discoverSection",
    "updateBtn",
    "discoverBtn",
    "openFeedsBtn",
    "optionsBtn"
  ]) {
    elements.set(id, new FakeEl(id));
  }

  const { store, storage } = installStorage({
    settings: { globalIntervalMinutes: 0, rootFolderName: "RSS" },
    feeds: {},
    lifecycle: {}
  });

  globalThis.document = {
    getElementById(id) {
      return elements.get(id);
    },
    createElement() {
      return new FakeEl();
    },
    querySelectorAll() {
      return [];
    }
  };

  let discoveredBatch = [];
  globalThis.chrome = {
    i18n: {
      getMessage(key, subs = []) {
        return subs.length ? `${key}:${subs.join(",")}` : key;
      }
    },
    storage,
    tabs: {
      async query() {
        return [{ id: 7 }];
      }
    },
    runtime: {
      async sendMessage(msg) {
        if (msg.action === "discoverFeeds") {
          return { ok: true, feeds: discoveredBatch };
        }
        return { ok: true };
      },
      openOptionsPage() {}
    }
  };

  let uuidSeq = 0;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      randomUUID() {
        uuidSeq += 1;
        return `uuid-${uuidSeq}`;
      }
    }
  });

  await import(`../ui/options.js?bugsweep-opt=${Date.now()}`);

  // Reject javascript: URL in manual add
  elements.get("feedUrl").value = "javascript:alert(1)";
  await elements.get("addBtn").click();
  assert.equal(Object.keys(store.feeds).length, 0);
  assert.match(elements.get("feedStatus").className, /error/);

  // Add valid feed twice -> only stored once
  elements.get("feedUrl").value = "https://example.test/feed.xml";
  await elements.get("addBtn").click();
  elements.get("feedUrl").value = "https://example.test/feed.xml";
  await elements.get("addBtn").click();
  assert.equal(Object.keys(store.feeds).length, 1);

  // Negative global interval is clamped to 0
  elements.get("globalInterval").value = "-25";
  await elements.get("saveSettings").click();
  assert.equal(store.settings.globalIntervalMinutes, 0);

  // Negative retentionDays change on rendered card is clamped to 0
  const renderedCard = elements.get("feedList").children[0];
  await renderedCard.listeners.change({
    target: {
      type: "number",
      value: "-10",
      dataset: { field: "retentionDays", id: "uuid-1" }
    }
  });
  assert.equal(store.feeds["uuid-1"].retentionDays, 0);

  // Popup discovery '+' button skips already subscribed URL and rejects non-HTTP(S) URL
  discoveredBatch = [
    { url: "javascript:alert(1)", title: "Bad Discovered" },
    { url: "https://example.test/feed.xml", title: "Already Subscribed" },
    { url: "https://example.test/new.xml", title: "New Discovered" }
  ];
  await import(`../ui/popup.js?bugsweep-popup=${Date.now()}`);
  await elements.get("discoverBtn").click();

  const discoverRows = elements.get("discoverSection").children;
  for (const row of discoverRows) {
    const plusBtn = row.children[1];
    if (plusBtn) await plusBtn.click();
  }
  assert.equal(Object.keys(store.feeds).length, 2);
});
