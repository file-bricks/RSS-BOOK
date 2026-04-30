import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  getEnabledFeeds,
  getState,
  removeFeed,
  updateSettings,
  upsertFeed
} from "../lib/storage.js";

afterEach(() => {
  delete globalThis.chrome;
});

function installStorage(initialState = {}) {
  const store = structuredClone(initialState);

  globalThis.chrome = {
    storage: {
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
    }
  };

  return store;
}

test("getState merges persisted settings with defaults", async () => {
  installStorage({
    settings: { rootFolderName: "Feeds" },
    feeds: {}
  });

  const state = await getState();

  assert.equal(state.settings.rootFolderName, "Feeds");
  assert.equal(state.settings.updateOnStartup, true);
  assert.equal(state.settings.globalIntervalMinutes, 0);
  assert.equal(state.settings.deleteBookmarksOnUnsubscribe, false);
});

test("upsertFeed, removeFeed, and getEnabledFeeds update local storage", async () => {
  const store = installStorage({ feeds: {} });

  await upsertFeed("a", { url: "https://example.test/a.xml", enabled: true });
  await upsertFeed("b", { url: "https://example.test/b.xml", enabled: false });
  await upsertFeed("a", { title: "Example A" });

  assert.deepEqual(await getEnabledFeeds(), [
    {
      id: "a",
      url: "https://example.test/a.xml",
      enabled: true,
      title: "Example A"
    }
  ]);

  await removeFeed("a");

  assert.deepEqual(Object.keys(store.feeds), ["b"]);
});

test("updateSettings preserves unchanged settings", async () => {
  const store = installStorage({
    settings: { rootFolderName: "RSS", globalIntervalMinutes: 30 }
  });

  await updateSettings({ rootFolderName: "My Feeds" });

  assert.deepEqual(store.settings, {
    rootFolderName: "My Feeds",
    globalIntervalMinutes: 30,
    updateOnStartup: true,
    rootFolderId: "",
    deleteBookmarksOnUnsubscribe: false
  });
});
