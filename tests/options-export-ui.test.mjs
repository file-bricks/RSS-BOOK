import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.crypto;
});

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.listeners = {};
    this.checked = false;
    this.value = "";
    this.files = [];
    this.className = "";
    this.dataset = {};
    this.type = "button";
    this.children = [];
    this._textContent = "";
    this._innerHTML = "";
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  async click() {
    if (this.listeners.click) {
      await this.listeners.click({ target: this });
    }
  }

  appendChild(child) {
    this.children.push(child);
  }

  querySelector() {
    return new FakeElement();
  }

  querySelectorAll() {
    return [];
  }

  getAttribute() {
    return null;
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this._innerHTML = this._textContent
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  get textContent() {
    return this._textContent;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? "");
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

function installOptionsPage({ feeds, lifecycle } = {}) {
  const elements = new Map();
  const store = {
    feeds: structuredClone(feeds || {}),
    lifecycle: structuredClone(lifecycle || {}),
    settings: {}
  };
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
    "feedStatus"
  ]) {
    elements.set(id, new FakeElement(id));
  }

  elements.get("globalInterval").type = "number";
  elements.get("rootFolderName").type = "text";
  elements.get("feedUrl").type = "url";
  elements.get("opmlFileInput").type = "file";

  globalThis.document = {
    getElementById(id) {
      assert.ok(elements.has(id), `missing test element ${id}`);
      return elements.get(id);
    },
    createElement() {
      return new FakeElement();
    },
    querySelectorAll() {
      return [];
    }
  };

  globalThis.chrome = {
    i18n: {
      getMessage(key, substitutions = []) {
        if (key === "optionsExported") return `exported:${substitutions[0]}`;
        if (key === "optionsOPMLImported") return `imported:${substitutions[0]}`;
        if (key === "popupError") return `error:${substitutions[0]}`;
        return key;
      }
    },
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.map((key) => [key, structuredClone(store[key])]));
        },
        async set(patch) {
          for (const [key, value] of Object.entries(patch)) {
            store[key] = structuredClone(value);
          }
        }
      }
    },
    bookmarks: {
      async getChildren(folderId) {
        if (folderId !== "folder-1") throw new Error("folder not found");
        return [{ title: "Entry One", url: "https://example.test/entry" }];
      }
    }
  };

  const writes = [];
  globalThis.window = {
    async showDirectoryPicker(options) {
      assert.equal(options?.mode, "readwrite");
      return {
        async getDirectoryHandle(folderName, directoryOptions) {
          assert.equal(folderName, "Example Feed");
          assert.equal(directoryOptions?.create, true);
          return {
            async getFileHandle(fileName, fileOptions) {
              assert.equal(fileName, "Entry One.url");
              assert.equal(fileOptions?.create, true);
              return {
                async createWritable() {
                  return {
                    async write(blob) {
                      writes.push(await blob.text());
                    },
                    async close() {}
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      randomUUID() {
        return `feed-${Object.keys(store.feeds).length + 1}`;
      }
    }
  });

  return { elements, writes, store };
}

test("options page exposes folder export button", () => {
  const html = fs.readFileSync(path.join(rootDir, "ui", "options.html"), "utf8");

  assert.match(html, /id="exportAllFoldersBtn"/);
  assert.match(html, /data-i18n="optionsExportAllFolders"/);
  assert.match(html, /id="refreshLifecycleBtn"/);
  assert.match(html, /id="lifecycleInfo"/);
});

test("options folder export button writes bookmark .url files and shows count", async () => {
  const { elements, writes } = installOptionsPage({
    feeds: {
      feed1: {
        id: "feed1",
        title: "Example Feed",
        url: "https://example.test/feed.xml",
        enabled: true,
        bookmarkFolderId: "folder-1"
      }
    }
  });

  await import(`../ui/options.js?options-export=${Date.now()}`);
  await elements.get("exportAllFoldersBtn").click();

  assert.deepEqual(writes, [
    "[InternetShortcut]\r\nURL=https://example.test/entry\r\n"
  ]);
  assert.equal(elements.get("feedStatus").textContent, "exported:1");
});

test("OPML import ignores duplicate feed URLs within the same file", async () => {
  const { elements, store } = installOptionsPage({ feeds: {} });
  const opmlFile = {
    async text() {
      return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Alpha" xmlUrl="https://example.test/feed.xml" />
    <outline text="Alpha Duplicate" xmlUrl="https://example.test/feed.xml" />
  </body>
</opml>`;
    }
  };

  await import(`../ui/options.js?options-opml=${Date.now()}`);

  const input = elements.get("opmlFileInput");
  await input.listeners.change({ target: { files: [opmlFile], value: "picked.opml" } });

  assert.equal(Object.keys(store.feeds).length, 1);
  assert.equal(store.feeds["feed-1"]?.url, "https://example.test/feed.xml");
  assert.equal(elements.get("feedStatus").textContent, "imported:1");
});

test("options page renders lifecycle diagnostics from storage", async () => {
  const { elements } = installOptionsPage({
    feeds: {},
    lifecycle: {
      workerBootedAt: Date.parse("2026-05-24T10:00:00Z"),
      alarmIntervalMinutes: 15,
      alarmSource: "feed",
      enabledFeedCount: 2,
      lastCycleAt: Date.parse("2026-05-24T10:05:00Z"),
      lastCycleReason: "alarm",
      lastCycleFeedCount: 2,
      lastPruneFeedCount: 2
    }
  });

  await import(`../ui/options.js?options-lifecycle=${Date.now()}`);

  const lifecycleText = elements.get("lifecycleInfo").textContent;
  assert.match(lifecycleText, /optionsLifecycleBoot/);
  assert.match(lifecycleText, /2026-05-24T10:00:00\.000Z/);
  assert.match(lifecycleText, /15 min \(optionsLifecycleAlarmSourceFeed\)/);
  assert.match(lifecycleText, /optionsLifecycleLastReasonoptionsLifecycleReasonAlarm/);
  assert.match(lifecycleText, /optionsLifecycleProcessedFeeds2/);
});
