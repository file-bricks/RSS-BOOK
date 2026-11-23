import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

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

function createAsyncLagStorage(initialState = {}, setDelayMs = 10) {
  const store = structuredClone(initialState);
  const setHistory = [];

  const storage = {
    local: {
      async get(keys) {
        await new Promise((r) => setTimeout(r, 2));
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, structuredClone(store[key])]));
        }
        if (typeof keys === "string") {
          return { [keys]: structuredClone(store[keys]) };
        }
        return structuredClone(store);
      },
      async set(patch) {
        await new Promise((r) => setTimeout(r, setDelayMs));
        setHistory.push(structuredClone(patch));
        for (const [key, value] of Object.entries(patch)) {
          store[key] = structuredClone(value);
        }
      }
    }
  };

  return { store, storage, setHistory };
}

test("BS-01: storage.js serializes concurrent updateSettings & updateLifecycle without lost updates", async () => {
  const { store, storage } = createAsyncLagStorage({
    settings: { rootFolderName: "RSS", globalIntervalMinutes: 0, rootFolderId: "" },
    lifecycle: { workerBootedAt: 0, alarmIntervalMinutes: 0, lastCycleAt: 0 }
  });
  globalThis.chrome = { storage };

  const { updateSettings, updateLifecycle } = await import(`../lib/storage.js?bs01=${Date.now()}`);

  await Promise.all([
    updateSettings({ rootFolderId: "bm-root-99" }),
    updateSettings({ globalIntervalMinutes: 30, deleteBookmarksOnUnsubscribe: true })
  ]);

  assert.equal(store.settings.rootFolderId, "bm-root-99", "concurrent rootFolderId write must not be lost");
  assert.equal(store.settings.globalIntervalMinutes, 30, "concurrent globalIntervalMinutes write must not be lost");
  assert.equal(store.settings.deleteBookmarksOnUnsubscribe, true);

  await Promise.all([
    updateLifecycle({ workerBootedAt: 1000 }),
    updateLifecycle({ alarmIntervalMinutes: 15, alarmSource: "global" }),
    updateLifecycle({ lastCycleAt: 2000, lastCycleReason: "startup" })
  ]);

  assert.equal(store.lifecycle.workerBootedAt, 1000, "workerBootedAt must survive concurrent lifecycle updates");
  assert.equal(store.lifecycle.alarmIntervalMinutes, 15, "alarmIntervalMinutes must survive concurrent lifecycle updates");
  assert.equal(store.lifecycle.lastCycleAt, 2000, "lastCycleAt must survive concurrent lifecycle updates");
});

test("BS-02: storage.js prevents zombie feed resurrection in mergeFeedSeen and tolerates corrupted non-object storage values", async () => {
  const { store, storage } = createAsyncLagStorage({
    settings: ["corrupted-array"],
    feeds: {
      deletedFeed: undefined,
      nullEntry: null,
      validFeed: {
        id: "validFeed",
        url: "https://example.test/rss.xml",
        enabled: true,
        seen: { badTs: "not-a-number", oldestReal: 10 }
      }
    },
    lifecycle: "corrupted-string"
  }, 1);
  delete store.feeds.deletedFeed;

  globalThis.chrome = { storage };
  const { getState, getLifecycle, getEnabledFeeds, mergeFeedSeen } = await import(`../lib/storage.js?bs02=${Date.now()}`);

  // mergeFeedSeen on an already removed feed must NOT create a headless zombie record
  await mergeFeedSeen("unsubscribed-in-flight", { "guid-1": 12345 });
  assert.equal(
    "unsubscribed-in-flight" in store.feeds,
    false,
    "mergeFeedSeen must not resurrect an unsubscribed feed as a URL-less zombie record"
  );

  // Corrupted settings/lifecycle/null feed entries must not throw in getEnabledFeeds / getState / getLifecycle
  const state = await getState();
  assert.equal(Array.isArray(state.settings), false);
  assert.equal(state.settings.rootFolderName, "RSS");

  const lifecycle = await getLifecycle();
  assert.equal(typeof lifecycle, "object");
  assert.equal(lifecycle.alarmSource, "disabled");

  const enabled = await getEnabledFeeds();
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].id, "validFeed");

  // Fill validFeed.seen past 800 entries when a corrupted NaN timestamp exists -> corrupted entry must be evicted first
  const delta = {};
  for (let i = 1; i <= 800; i += 1) {
    delta[`fresh-${i}`] = 100 + i;
  }
  await mergeFeedSeen("validFeed", delta);
  assert.equal(Object.keys(store.feeds.validFeed.seen).length, 800);
  assert.equal("badTs" in store.feeds.validFeed.seen, false, "non-numeric seen timestamp must sort as 0 and be evicted");
  assert.equal("oldestReal" in store.feeds.validFeed.seen, false);
  assert.equal("fresh-800" in store.feeds.validFeed.seen, true);
});

test("BS-03: sw.js coalesces concurrent updateFeed calls for the same feed and never resurrects a feed unsubscribed mid-fetch", async () => {
  const listeners = { onMessage: null, onChanged: null, onInstalled: null };
  const { store, storage } = createAsyncLagStorage({
    settings: { updateOnStartup: true, globalIntervalMinutes: 0, rootFolderName: "RSS", rootFolderId: "root-1" },
    feeds: {
      feedRace: {
        id: "feedRace",
        url: "https://example.test/race.xml",
        title: "Race Feed",
        enabled: true,
        notify: false,
        bookmarkFolderId: "",
        seen: {}
      },
      feedUnsub: {
        id: "feedUnsub",
        url: "https://example.test/unsub.xml",
        title: "Unsub Feed",
        enabled: true,
        notify: false,
        bookmarkFolderId: "",
        seen: {}
      }
    },
    lifecycle: {}
  }, 1);

  const createdFolders = [];
  const createdBookmarks = [];

  globalThis.fetch = async (url) => {
    await new Promise((r) => setTimeout(r, 25));
    if (String(url).includes("unsub.xml")) {
      // Simulate user clicking Unsubscribe while network fetch is in flight
      delete store.feeds.feedUnsub;
    }
    return new Response(
      `<rss version="2.0"><channel><title>Live</title><item><title>Post 1</title><link>https://example.test/p1</link><guid>g1</guid></item></channel></rss>`,
      { status: 200 }
    );
  };

  globalThis.chrome = {
    runtime: {
      id: "rss-book-self",
      onInstalled: { addListener: (fn) => { listeners.onInstalled = fn; } },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: (fn) => { listeners.onMessage = fn; } }
    },
    alarms: {
      onAlarm: { addListener: () => {} },
      async get() { return null; },
      async clear() {},
      async create() {}
    },
    storage: {
      ...storage,
      onChanged: { addListener: (fn) => { listeners.onChanged = fn; } }
    },
    bookmarks: {
      async get(id) {
        if (id === "root-1" || id.startsWith("folder-")) return [{ id, title: "Folder" }];
        throw new Error("not found");
      },
      async create(payload) {
        if (!payload.url) {
          createdFolders.push(payload);
          return { id: `folder-${createdFolders.length}` };
        }
        createdBookmarks.push(payload);
        return { id: `bm-${createdBookmarks.length}` };
      }
    }
  };

  const { bootPromise } = await import(`../sw.js?bs03=${Date.now()}`);
  await bootPromise;

  const invokeMsg = (msg, sender = { id: "rss-book-self" }) =>
    new Promise((resolve) => {
      const keepChannel = listeners.onMessage(msg, sender, resolve);
      if (!keepChannel) resolve(undefined);
    });

  // 1) Null/malformed message must not throw synchronously
  assert.doesNotThrow(() => listeners.onMessage(null, { id: "rss-book-self" }, () => {}));

  // 2) Two overlapping updateFeed calls for feedRace must create ONLY ONE folder and ONE bookmark
  await Promise.all([
    invokeMsg({ action: "updateFeed", feedId: "feedRace" }),
    invokeMsg({ action: "updateFeed", feedId: "feedRace" })
  ]);

  assert.equal(createdFolders.length, 1, "overlapping updateFeed calls must not create duplicate feed folders");
  assert.equal(createdBookmarks.length, 1, "overlapping updateFeed calls must not create duplicate bookmarks");

  // 3) Unsubscribing feedUnsub mid-fetch must NOT recreate feedUnsub or orphan bookmarks
  await invokeMsg({ action: "updateFeed", feedId: "feedUnsub" });
  assert.equal("feedUnsub" in store.feeds, false, "unsubscribed feed must not be resurrected in storage after fetch completes");
  assert.equal(createdFolders.length, 1, "unsubscribed feed must not create a new bookmark folder after removal");
});

test("BS-04: sw.js clamps invalid/fractional alarm periods, skips ensureAlarm on metadata-only feed writes, and initializes full default settings", async () => {
  const listeners = { onChanged: null, onInstalled: null };
  let alarmGetCount = 0;
  const { store, storage } = createAsyncLagStorage({
    settings: {},
    feeds: {},
    lifecycle: {}
  }, 1);
  delete store.settings;

  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener: (fn) => { listeners.onInstalled = fn; } },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} }
    },
    alarms: {
      onAlarm: { addListener: () => {} },
      async get() {
        alarmGetCount += 1;
        return null;
      },
      async clear() {},
      async create() {}
    },
    storage: {
      ...storage,
      onChanged: { addListener: (fn) => { listeners.onChanged = fn; } }
    }
  };

  const { bootPromise, computeAlarmPlan } = await import(`../sw.js?bs04=${Date.now()}`);
  await bootPromise;

  // Infinity / NaN / fractional < 1 intervals must be safely normalized
  assert.equal(computeAlarmPlan({ globalIntervalMinutes: Infinity }, []).intervalMinutes, 0);
  assert.equal(computeAlarmPlan({ globalIntervalMinutes: 0.25 }, []).intervalMinutes, 1);
  assert.equal(
    computeAlarmPlan({ globalIntervalMinutes: 0 }, [{ intervalMinutes: 0.4 }, { intervalMinutes: Infinity }]).intervalMinutes,
    1
  );

  // Metadata-only feed change (lastFetch / seen / lastError) must NOT trigger ensureAlarm()
  const beforeCount = alarmGetCount;
  await listeners.onChanged(
    {
      feeds: {
        oldValue: { f1: { id: "f1", enabled: true, intervalMinutes: 15, lastFetch: 100, seen: {} } },
        newValue: { f1: { id: "f1", enabled: true, intervalMinutes: 15, lastFetch: 200, seen: { a: 200 } } }
      }
    },
    "local"
  );
  assert.equal(alarmGetCount, beforeCount, "metadata-only feed updates must not trigger redundant ensureAlarm checks");

  // onInstalled must populate deleteBookmarksOnUnsubscribe default
  await listeners.onInstalled();
  assert.equal(store.settings.deleteBookmarksOnUnsubscribe, false);
});

test("BS-05: options.js escapes card attributes/localized errors safely, reads fresh bookmarkFolderId on unsubscribe, and deduplicates mixed-case URLs", async () => {
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
      this.children = [];
      this._text = "";
      this._html = "";
      this._removeBtn = null;
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    async click() { if (this.listeners.click) await this.listeners.click({ target: this }); }
    appendChild(child) { this.children.push(child); }
    querySelector(sel) {
      if (sel === "[data-action='remove']") {
        if (!this._removeBtn) this._removeBtn = new FakeEl("removeBtn");
        return this._removeBtn;
      }
      return new FakeEl();
    }
    querySelectorAll() { return []; }
    getAttribute() { return null; }
    set textContent(v) {
      this._text = String(v ?? "");
      this._html = this._text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }
    get textContent() { return this._text; }
    set innerHTML(v) { this._html = String(v ?? ""); this.children = []; }
    get innerHTML() { return this._html; }
  }

  const elements = new Map();
  for (const id of [
    "updateOnStartup", "globalInterval", "rootFolderName", "deleteBookmarks",
    "saveSettings", "refreshLifecycleBtn", "addBtn", "feedUrl", "importOPMLBtn",
    "opmlFileInput", "exportOPMLBtn", "exportAllFoldersBtn", "feedList",
    "lifecycleInfo", "settingsStatus", "feedStatus"
  ]) {
    elements.set(id, new FakeEl(id));
  }

  const removedTrees = [];
  const { store, storage } = createAsyncLagStorage({
    settings: {
      updateOnStartup: true,
      globalIntervalMinutes: 0,
      rootFolderName: "RSS",
      rootFolderId: "root-protected",
      deleteBookmarksOnUnsubscribe: true
    },
    feeds: {
      'id" onload="alert(1)': {
        id: 'id" onload="alert(1)',
        url: "https://example.test/feed.xml",
        title: "Sec Feed",
        enabled: true,
        notify: true,
        intervalMinutes: 0,
        retentionDays: 30,
        bookmarkFolderId: "",
        lastError: "Bad <tag> & reason"
      }
    },
    lifecycle: {}
  }, 1);

  globalThis.document = {
    getElementById: (id) => elements.get(id),
    createElement: () => new FakeEl(),
    querySelectorAll: () => []
  };

  globalThis.chrome = {
    i18n: {
      getMessage(key, subs = []) {
        if (key === "optionsFeedError") return `Error <raw>: ${subs[0]}`;
        return key;
      }
    },
    storage,
    bookmarks: {
      async removeTree(folderId) {
        removedTrees.push(folderId);
      }
    },
    runtime: {
      async sendMessage() { return { ok: true }; }
    }
  };

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "uuid-new" }
  });

  await import(`../ui/options.js?bs05=${Date.now()}`);
  await new Promise((r) => setTimeout(r, 20));

  const card = elements.get("feedList").children[0];
  assert.ok(!card.innerHTML.includes('data-id="id" onload='), "feed.id in data-id attribute must be HTML-attribute escaped");
  assert.ok(!card.innerHTML.includes("Error <raw>:"), "localized error wrapper must be HTML-escaped");
  assert.ok(!card.innerHTML.includes("&amp;lt;tag&amp;gt;"), "feed.lastError must not be double-HTML-escaped");

  // Mixed-case duplicate host URL must be recognized as already subscribed
  elements.get("feedUrl").value = "HTTPS://EXAMPLE.TEST/feed.xml";
  await elements.get("addBtn").click();
  assert.equal(Object.keys(store.feeds).length, 1, "case-variant scheme/host URL must not create duplicate subscription");

  // Simulate background worker setting bookmarkFolderId AFTER options page rendered
  store.feeds['id" onload="alert(1)'].bookmarkFolderId = "folder-created-later";
  await card.querySelector("[data-action='remove']").click();
  assert.deepEqual(
    removedTrees,
    ["folder-created-later"],
    "unsubscribe must read fresh bookmarkFolderId from storage instead of stale render closure"
  );

  // Stale card field change after feed was already unsubscribed must not recreate a URL-less relic
  await card.listeners.change({
    target: {
      type: "checkbox",
      checked: false,
      dataset: { field: "notify", id: 'id" onload="alert(1)' }
    }
  });
  assert.equal(Object.keys(store.feeds).length, 0, "stale card change must not resurrect an unsubscribed feed");
});

test("BS-06: popup.js avoids 'NaN min ago' on non-numeric lastFetch and falls back cleanly when stored rootFolderId was deleted", async () => {
  class FakeEl {
    constructor(id = "") {
      this.id = id;
      this.listeners = {};
      this.className = "";
      this.disabled = false;
      this.title = "";
      this.children = [];
      this._text = "";
      this._html = "";
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    async click() { if (this.listeners.click) await this.listeners.click({ target: this }); }
    appendChild(child) { this.children.push(child); }
    querySelectorAll() { return []; }
    getAttribute() { return null; }
    set textContent(v) { this._text = String(v ?? ""); this._html = this._text; }
    get textContent() { return this._text; }
    set innerHTML(v) { this._html = String(v ?? ""); this.children = []; }
    get innerHTML() { return this._html; }
  }

  const elements = new Map();
  for (const id of ["feedList", "status", "discoverSection", "updateBtn", "discoverBtn", "openFeedsBtn", "optionsBtn"]) {
    elements.set(id, new FakeEl(id));
  }

  const openedTabs = [];
  const { storage } = createAsyncLagStorage({
    settings: { rootFolderId: "deleted-folder-id" },
    feeds: {
      fCorrupt: {
        id: "fCorrupt",
        url: "https://example.test/corrupt.xml",
        title: "Corrupt Timestamp Feed",
        enabled: true,
        lastFetch: "corrupted-timestamp"
      }
    }
  }, 1);

  globalThis.navigator = { userAgent: "Mozilla/5.0 Chrome/130.0.0.0" };
  globalThis.window = { close() {} };
  globalThis.document = {
    getElementById: (id) => elements.get(id),
    createElement: () => new FakeEl(),
    querySelectorAll: () => []
  };
  globalThis.chrome = {
    i18n: {
      getMessage(key, subs = []) {
        if (key === "popupMinAgo") return `${subs[0]} min ago`;
        if (key === "popupNeverUpdated") return "never updated";
        return key;
      }
    },
    storage,
    bookmarks: {
      async get() {
        throw new Error("Bookmark node not found");
      }
    },
    tabs: {
      async create(opts) {
        openedTabs.push(opts.url);
      }
    },
    runtime: { openOptionsPage() {} }
  };

  await import(`../ui/popup.js?bs06=${Date.now()}`);
  await new Promise((r) => setTimeout(r, 20));

  const renderedItem = elements.get("feedList").children[0];
  const infoDiv = renderedItem.children[1];
  const timeSpan = infoDiv.children[0];
  assert.equal(timeSpan.textContent, "never updated", "corrupted lastFetch must not render 'NaN min ago'");

  await elements.get("openFeedsBtn").click();
  assert.deepEqual(
    openedTabs,
    ["chrome://bookmarks/"],
    "deleted rootFolderId must fall back to root bookmarks URL instead of broken ?id=deleted-folder-id"
  );
});

test("BS-07: i18n.js works without global chrome.i18n and package-extension.mjs excludes backup/conflict/OS-junk files & blocks outputFile traversal", async () => {
  delete globalThis.chrome;
  const { t, applyI18n } = await import(`../lib/i18n.js?bs07=${Date.now()}`);
  assert.equal(t("popupDone"), "popupDone", "t() must not throw ReferenceError when global chrome is absent");
  assert.doesNotThrow(() => applyI18n({ querySelectorAll: () => [] }));

  const { buildExtensionPackage, collectPackageEntries } = await import(`../scripts/package-extension.mjs?bs07=${Date.now()}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rss-book-pkg-hygiene-"));

  try {
    // Copy minimal valid extension tree into tempRoot
    for (const rel of ["manifest.json", "package.json", "sw.js", "LICENSE", "PRIVACY_POLICY.md"]) {
      fs.copyFileSync(path.join(rootDir, rel), path.join(tempRoot, rel));
    }
    for (const dir of ["icons", "_locales", "lib", "ui"]) {
      fs.cpSync(path.join(rootDir, dir), path.join(tempRoot, dir), { recursive: true });
    }

    // Inject backup, OneDrive A7 conflict, and OS metadata junk inside lib/ and ui/
    fs.writeFileSync(path.join(tempRoot, "lib", "storage_BUGSWEEP_PRE_20260611.js"), "// backup");
    fs.writeFileSync(path.join(tempRoot, "ui", "options-LAPTOP-HOST01.js"), "// conflict");
    fs.writeFileSync(path.join(tempRoot, "ui", "desktop.ini"), "[.ShellClassInfo]");
    fs.writeFileSync(path.join(tempRoot, "lib", "notes.bak"), "bak");
    fs.writeFileSync(path.join(tempRoot, "lib", ".DS_Store"), "junk");
    fs.writeFileSync(path.join(tempRoot, "ui", "LOCK.ui.txt"), "owner: test");

    const entries = await collectPackageEntries(tempRoot);
    const names = entries.map((e) => e.name);
    assert.equal(names.some((n) => n.includes("BUGSWEEP_PRE")), false, "BUGSWEEP backup files must be excluded from store ZIP");
    assert.equal(names.some((n) => n.includes("-HOST01")), false, "OneDrive conflict copies must be excluded from store ZIP");
    assert.equal(names.some((n) => n.includes("LOCK.")), false, "scoped LOCK files must be excluded from store ZIP");
    assert.equal(names.some((n) => n.endsWith("desktop.ini") || n.endsWith(".bak") || n.endsWith(".DS_Store")), false);

    // Path traversal in outputFile must be rejected
    await assert.rejects(
      () => buildExtensionPackage({ rootDir: tempRoot, outputDir: path.join(tempRoot, "dist"), outputFile: "../escaped.zip", quiet: true }),
      /outputFile|path|invalid/i
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("BS-08: edge-preflight.mjs rejects truncated/corrupt PNGs without RangeError and enforces 132-char extDescription across all locales", async () => {
  const { runEdgePreflight } = await import(`../scripts/edge-preflight.mjs?bs08=${Date.now()}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rss-book-preflight-guard-"));

  try {
    for (const rel of ["manifest.json", "package.json", "sw.js", "LICENSE", "PRIVACY_POLICY.md"]) {
      fs.copyFileSync(path.join(rootDir, rel), path.join(tempRoot, rel));
    }
    for (const dir of ["icons", "assets", "_locales", "lib", "ui"]) {
      fs.cpSync(path.join(rootDir, dir), path.join(tempRoot, dir), { recursive: true });
    }

    // 1) Truncated 4-byte fake PNG ("\x89PNG") must throw controlled Error, NOT RangeError [ERR_OUT_OF_RANGE]
    fs.writeFileSync(path.join(tempRoot, "icons", "300.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await assert.rejects(
      async () => {
        try {
          await runEdgePreflight({ rootDir: tempRoot, outputDir: path.join(tempRoot, "dist"), quiet: true });
        } catch (err) {
          assert.notEqual(err.name, "RangeError", "truncated PNG must not crash with uncaught RangeError");
          throw err;
        }
      },
      /Expected PNG asset|Invalid PNG/i
    );

    // Restore valid 300.png, then make non-default locale ("de") extDescription > 132 chars
    fs.copyFileSync(path.join(rootDir, "icons", "300.png"), path.join(tempRoot, "icons", "300.png"));
    const dePath = path.join(tempRoot, "_locales", "de", "messages.json");
    const deJson = JSON.parse(fs.readFileSync(dePath, "utf8"));
    deJson.extDescription.message = "X".repeat(140);
    fs.writeFileSync(dePath, JSON.stringify(deJson, null, 2), "utf8");

    await assert.rejects(
      () => runEdgePreflight({ rootDir: tempRoot, outputDir: path.join(tempRoot, "dist"), quiet: true }),
      /132|extDescription|description/i,
      "preflight must reject >132-char extDescription in non-default locales"
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("BS-02b: storage.js ignores inherited prototype keys in patchExistingFeed and mergeFeedSeen", async () => {
  const { store, storage } = createAsyncLagStorage({ feeds: {} }, 1);
  globalThis.chrome = { storage };
  const { patchExistingFeed, mergeFeedSeen } = await import(`../lib/storage.js?bs02b=${Date.now()}`);

  for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(await patchExistingFeed(key, { url: "https://example.test/x" }), false, `patchExistingFeed must reject inherited key ${key}`);
    assert.equal(await mergeFeedSeen(key, { g: 1 }), false, `mergeFeedSeen must reject inherited key ${key}`);
    assert.equal(Object.hasOwn(store.feeds, key), false, `${key} must not become an own feed entry`);
  }
  assert.equal(Object.getPrototypeOf(store.feeds), Object.prototype);
  assert.deepEqual(Object.keys(store.feeds), []);
});
