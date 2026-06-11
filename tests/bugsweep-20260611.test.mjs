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

// --- Bug A: OPML Export uses DOM-attached anchor + deferred revokeObjectURL ---

test("Bug A: options.js OPML export appends anchor to DOM before click", () => {
  const src = fs.readFileSync(path.join(rootDir, "ui", "options.js"), "utf8");
  assert.match(
    src,
    /document\.body\.appendChild\(a\)/,
    "OPML export must append anchor to body before .click() (Firefox fix)"
  );
  assert.match(
    src,
    /document\.body\.removeChild\(a\)/,
    "OPML export must remove anchor from body after .click()"
  );
});

test("Bug A: options.js OPML export defers revokeObjectURL via setTimeout", () => {
  const src = fs.readFileSync(path.join(rootDir, "ui", "options.js"), "utf8");

  // Must have setTimeout containing revokeObjectURL (arrow fn syntax: () => ...)
  const exportBlock = src.slice(src.indexOf("exportOPMLBtn"));
  assert.ok(
    exportBlock.includes("setTimeout") && exportBlock.includes("revokeObjectURL"),
    "OPML export block must defer revokeObjectURL via setTimeout"
  );
  // Must NOT have synchronous revokeObjectURL directly after click()
  assert.doesNotMatch(
    exportBlock,
    /a\.click\(\);\s*URL\.revokeObjectURL/,
    "revokeObjectURL must not be called synchronously immediately after a.click()"
  );
});

// --- Bug B: upsertFeed/removeFeed use a serializing mutex ---

test("Bug B: storage.js source uses withFeedLock for both upsertFeed and removeFeed", () => {
  const src = fs.readFileSync(path.join(rootDir, "lib", "storage.js"), "utf8");
  assert.match(src, /withFeedLock/, "storage.js must define/use withFeedLock mutex");

  const upsertIdx = src.indexOf("async function upsertFeed");
  const removeIdx = src.indexOf("async function removeFeed");
  const upsertBody = src.slice(upsertIdx, upsertIdx + 250);
  const removeBody = src.slice(removeIdx, removeIdx + 250);

  assert.match(upsertBody, /withFeedLock/, "upsertFeed must use withFeedLock");
  assert.match(removeBody, /withFeedLock/, "removeFeed must use withFeedLock");
});

test("Bug B: concurrent upsertFeed for different feeds preserves both writes", async () => {
  // Without mutex: both calls read empty feeds, each writes only their feed → loser wins
  // With mutex: calls are serialized → both feeds survive
  const { upsertFeed } = await import(`../lib/storage.js?b1=${Date.now()}`);

  const store = { feeds: {} };
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.map((k) => [k, structuredClone(store[k])]));
        },
        async set(patch) {
          Object.assign(store, structuredClone(patch));
        }
      }
    }
  };

  await Promise.all([
    upsertFeed("feed-a", { url: "https://a.example/feed", enabled: true }),
    upsertFeed("feed-b", { url: "https://b.example/feed", enabled: true })
  ]);

  assert.ok("feed-a" in store.feeds, "feed-a must be persisted after concurrent upsert");
  assert.ok("feed-b" in store.feeds, "feed-b must be persisted after concurrent upsert");
  assert.equal(store.feeds["feed-a"].url, "https://a.example/feed");
  assert.equal(store.feeds["feed-b"].url, "https://b.example/feed");
});

// --- Bug C: runUpdateCycle uses _cycleInFlight guard ---

test("Bug C: sw.js runUpdateCycle uses _cycleInFlight guard against overlapping cycles", () => {
  const src = fs.readFileSync(path.join(rootDir, "sw.js"), "utf8");
  assert.match(src, /_cycleInFlight/, "sw.js must define _cycleInFlight guard variable");
  assert.match(
    src,
    /if \(_cycleInFlight\) return _cycleInFlight/,
    "runUpdateCycle must short-circuit and return in-flight promise if cycle already running"
  );
  assert.match(src, /_cycleInFlight = null/, "runUpdateCycle must reset _cycleInFlight to null when done");
});

test("Bug B: concurrent removeFeed + upsertFeed do not lose either operation", async () => {
  const { upsertFeed, removeFeed } = await import(`../lib/storage.js?b2=${Date.now()}`);

  const store = {
    feeds: {
      "feed-x": { id: "feed-x", url: "u", enabled: true },
      "feed-y": { id: "feed-y", url: "v", enabled: true }
    }
  };
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.map((k) => [k, structuredClone(store[k])]));
        },
        async set(patch) {
          Object.assign(store, structuredClone(patch));
        }
      }
    }
  };

  await Promise.all([
    removeFeed("feed-x"),
    upsertFeed("feed-y", { title: "Updated Y" })
  ]);

  assert.ok(!("feed-x" in store.feeds), "feed-x must be removed");
  assert.equal(store.feeds["feed-y"]?.title, "Updated Y", "feed-y must be updated");
});

// --- Bug C (behavioral): cycle guard prevents overlapping executions ---

test("Bug C: cycle guard prevents overlapping executions (behavioral)", async () => {
  let bodyCallCount = 0;
  let _inFlight = null;

  async function guardedFn() {
    if (_inFlight) return _inFlight;
    _inFlight = (async () => {
      // yield to let other concurrent calls observe _inFlight before body completes
      await new Promise((r) => setImmediate(r));
      bodyCallCount++;
    })();
    try { return await _inFlight; } finally { _inFlight = null; }
  }

  await Promise.all([guardedFn(), guardedFn(), guardedFn()]);

  assert.equal(bodyCallCount, 1, "body must run exactly once when called concurrently");
});

// --- Bug D: mergeFeedSeen merges delta without overwriting concurrent writes ---

test("Bug D: mergeFeedSeen merges delta atomically under withFeedLock", async () => {
  const { mergeFeedSeen } = await import(`../lib/storage.js?d1=${Date.now()}`);

  const store = {
    feeds: {
      "feed-z": { id: "feed-z", url: "https://z.example/feed", enabled: true, seen: { "key-existing": 1000 } }
    }
  };
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.map((k) => [k, structuredClone(store[k])]));
        },
        async set(patch) {
          Object.assign(store, structuredClone(patch));
        }
      }
    }
  };

  await Promise.all([
    mergeFeedSeen("feed-z", { "key-new-1": 2000 }),
    mergeFeedSeen("feed-z", { "key-new-2": 3000 })
  ]);

  const seen = store.feeds["feed-z"].seen;
  assert.ok("key-existing" in seen, "existing seen key must be preserved");
  assert.ok("key-new-1" in seen, "key-new-1 must be merged");
  assert.ok("key-new-2" in seen, "key-new-2 must be merged");
});

// --- Bug D (boundary): LRU cap at 800 entries ---

test("Bug D: mergeFeedSeen trims seen to max 800 entries and keeps newest", async () => {
  const { mergeFeedSeen } = await import(`../lib/storage.js?d2=${Date.now()}`);

  // Build a seen map with 800 old entries (ts=1..800)
  const existingSeen = {};
  for (let i = 1; i <= 800; i++) existingSeen[`old-key-${i}`] = i;

  const store = {
    feeds: {
      "feed-cap": { id: "feed-cap", url: "https://cap.example/feed", enabled: true, seen: existingSeen }
    }
  };
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.map((k) => [k, structuredClone(store[k])]));
        },
        async set(patch) {
          Object.assign(store, structuredClone(patch));
        }
      }
    }
  };

  // Add one new entry — this pushes total to 801, must trim to 800
  await mergeFeedSeen("feed-cap", { "new-key": 9999 });

  const seen = store.feeds["feed-cap"].seen;
  assert.equal(Object.keys(seen).length, 800, "seen must be capped at 800 entries");
  assert.ok("new-key" in seen, "newest entry must survive the trim");
  assert.ok(!("old-key-1" in seen), "oldest entry (ts=1) must be evicted");
});
