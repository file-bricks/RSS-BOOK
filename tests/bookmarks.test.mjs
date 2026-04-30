import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  addItemsToBookmarks,
  ensureFeedFolder,
  pruneOldBookmarks
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
