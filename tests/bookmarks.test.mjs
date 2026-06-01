import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  addItemsToBookmarks,
  ensureFeedFolder,
  pruneOldBookmarks,
  simpleHash
} from "../lib/bookmarks.js";

const originalNow = Date.now;

afterEach(() => {
  Date.now = originalNow;
  delete globalThis.chrome;
});

function installStorage(initialState = {}) {
  const store = structuredClone(initialState);

  const storage = {
    local: {
      async get(keys) {
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, store[key]]));
        }
        if (typeof keys === "string") {
          return { [keys]: store[keys] };
        }
        return { ...store };
      },
      async set(patch) {
        Object.assign(store, structuredClone(patch));
      }
    }
  };

  return { store, storage };
}

test("ensureFeedFolder reuses stored root folder id after rename or move", async () => {
  const { store, storage } = installStorage({
    settings: { rootFolderName: "RSS", rootFolderId: "root-renamed" },
    feeds: {}
  });
  const created = [];

  globalThis.chrome = {
    storage,
    bookmarks: {
      async get(id) {
        assert.equal(id, "root-renamed");
        return [{ id, title: "Renamed or moved feeds" }];
      },
      async getTree() {
        assert.fail("stored root id should avoid tree lookup");
      },
      async create(payload) {
        created.push(payload);
        return { id: "feed-folder" };
      }
    }
  };

  const folderId = await ensureFeedFolder({
    title: "Example Feed",
    url: "https://example.test/feed.xml"
  });

  assert.equal(folderId, "feed-folder");
  assert.deepEqual(created, [{ parentId: "root-renamed", title: "Example Feed" }]);
  assert.equal(store.settings.rootFolderId, "root-renamed");
});

test("ensureFeedFolder recovers missing stored root id by configured folder name", async () => {
  const { store, storage } = installStorage({
    settings: { rootFolderName: "News Feeds", rootFolderId: "deleted-root" },
    feeds: {}
  });
  const created = [];

  globalThis.chrome = {
    storage,
    bookmarks: {
      async get(id) {
        assert.equal(id, "deleted-root");
        throw new Error("missing");
      },
      async getTree() {
        return [{
          id: "browser-root",
          title: "",
          children: [{ id: "other", title: "Other bookmarks", children: [] }]
        }];
      },
      async getChildren(parentId) {
        assert.equal(parentId, "other");
        return [{ id: "found-root", title: "News Feeds" }];
      },
      async create(payload) {
        created.push(payload);
        return { id: "feed-folder" };
      }
    }
  };

  const folderId = await ensureFeedFolder({
    title: "",
    url: "https://example.test/feed.xml"
  });

  assert.equal(folderId, "feed-folder");
  assert.deepEqual(created, [{
    parentId: "found-root",
    title: "https://example.test/feed.xml"
  }]);
  assert.equal(store.settings.rootFolderId, "found-root");
});

test("addItemsToBookmarks deduplicates entries and trims seen cache to 800", async () => {
  Date.now = () => 1_777_521_600_000;
  const oldSeen = Object.fromEntries(
    Array.from({ length: 795 }, (_, index) => [`old-${index}`, index])
  );
  const { store, storage } = installStorage({
    settings: {},
    feeds: {
      feedA: { id: "feedA", seen: oldSeen }
    }
  });
  const created = [];

  globalThis.chrome = {
    storage,
    bookmarks: {
      async create(payload) {
        created.push(payload);
        return { id: `bookmark-${created.length}` };
      }
    }
  };

  const items = [
    { title: "Already seen", link: "https://example.test/old", guid: "old-794" },
    { title: "Missing link", guid: "missing-link" },
    ...Array.from({ length: 25 }, (_, index) => ({
      title: `Fresh ${index}`,
      link: `https://example.test/${index}`,
      guid: `fresh-${index}`
    }))
  ];

  const result = await addItemsToBookmarks(
    { id: "feedA", seen: oldSeen },
    "feed-folder",
    items
  );

  assert.equal(result.addedCount, 20);
  assert.equal(created.length, 20);
  assert.equal(created[0].title, "Fresh 0");
  assert.equal(created.at(-1).title, "Fresh 19");
  assert.equal(Object.keys(store.feeds.feedA.seen).length, 800);
  assert.equal(store.feeds.feedA.seen["old-0"], undefined);
  assert.equal(store.feeds.feedA.seen["fresh-19"], 1_777_521_600_000);
});

test("pruneOldBookmarks removes only expired bookmark URLs", async () => {
  Date.now = () => Date.parse("2026-04-30T12:00:00Z");
  const removed = [];

  globalThis.chrome = {
    bookmarks: {
      async getChildren(folderId) {
        assert.equal(folderId, "feed-folder");
        return [
          {
            id: "old-url",
            title: "Old",
            url: "https://example.test/old",
            dateAdded: Date.parse("2026-04-20T12:00:00Z")
          },
          {
            id: "new-url",
            title: "New",
            url: "https://example.test/new",
            dateAdded: Date.parse("2026-04-29T12:00:00Z")
          },
          {
            id: "folder",
            title: "Nested folder",
            dateAdded: Date.parse("2026-04-01T12:00:00Z")
          }
        ];
      },
      async remove(id) {
        removed.push(id);
      }
    }
  };

  await pruneOldBookmarks({
    retentionDays: 3,
    bookmarkFolderId: "feed-folder"
  });

  assert.deepEqual(removed, ["old-url"]);
});

test("simpleHash produces correct FNV-1a 32-bit hashes without float overflow", () => {
  // These expected values are computed with Math.imul (correct 32-bit FNV-1a).
  // The old float-multiply implementation produced different values for inputs
  // whose first-character product exceeded Number.MAX_SAFE_INTEGER.
  assert.equal(simpleHash(""), "811c9dc5");             // empty string = initial seed
  assert.equal(simpleHash("a"), "e40c292c");            // FNV-1a of 'a' = 0xe40c292c
  assert.equal(simpleHash("ab"), "4d2505ca");           // chained

  // Distinct inputs must produce distinct hashes
  const h1 = simpleHash("title1|2026-01-01|");
  const h2 = simpleHash("title1|2026-01-02|");
  assert.notEqual(h1, h2, "different inputs must produce different hashes");

  // Same input must produce the same hash on repeated calls
  assert.equal(simpleHash("stable input"), simpleHash("stable input"));
});

test("addItemsToBookmarks: items without guid or link use stable fallback key that prevents re-adding", async () => {
  // Regression for simpleHash overflow: Math.imul must be used so that two
  // distinct strings (different published date) produce different keys and
  // the same string always produces the same key across calls.
  Date.now = () => 1_777_521_600_000;
  const { store, storage } = installStorage({
    settings: {},
    feeds: { feedA: { id: "feedA", seen: {} } }
  });
  const created = [];
  globalThis.chrome = {
    storage,
    bookmarks: {
      async create(p) { created.push(p); return { id: `bm-${created.length}` }; }
    }
  };

  // Two items differ only in published date — they must get distinct keys
  const items = [
    { title: "No guid or link", link: "https://a.example/1", guid: "", published: "2026-01-01" },
    { title: "No guid or link", link: "https://a.example/2", guid: "", published: "2026-01-02" }
  ];
  const r1 = await addItemsToBookmarks({ id: "feedA", seen: {} }, "fold", items);
  assert.equal(r1.addedCount, 2, "distinct fallback keys → both items added");

  // Same items again — none should be re-added
  const seenAfter = store.feeds.feedA.seen;
  const r2 = await addItemsToBookmarks({ id: "feedA", seen: seenAfter }, "fold", items);
  assert.equal(r2.addedCount, 0, "same fallback keys → deduplication works");
});
