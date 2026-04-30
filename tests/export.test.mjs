import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { exportAllFeedsToFolder, exportFeedToFolder } from "../lib/export.js";

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.window;
});

function installExportMocks(bookmarksByFolder) {
  const writes = [];

  function makeDirectory(folderName) {
    return {
      async getDirectoryHandle(name, options) {
        assert.equal(options?.create, true);
        return makeDirectory(name);
      },
      async getFileHandle(fileName, options) {
        assert.equal(options?.create, true);
        return {
          async createWritable() {
            return {
              async write(blob) {
                writes.push({
                  folderName,
                  fileName,
                  content: await blob.text()
                });
              },
              async close() {}
            };
          }
        };
      }
    };
  }

  globalThis.window = {
    async showDirectoryPicker(options) {
      assert.equal(options?.mode, "readwrite");
      return makeDirectory("root");
    }
  };

  globalThis.chrome = {
    bookmarks: {
      async getChildren(folderId) {
        if (!(folderId in bookmarksByFolder)) {
          throw new Error("folder not found");
        }
        return bookmarksByFolder[folderId];
      }
    }
  };

  return writes;
}

test("exports all feed bookmarks into sanitized .url files", async () => {
  const writes = installExportMocks({
    folderA: [
      { title: "First: Item", url: "https://example.test/first?x=1" },
      { title: "Nested Folder" }
    ],
    folderB: [
      { title: "Second <Item>", url: "https://example.test/second" }
    ]
  });

  const exported = await exportAllFeedsToFolder([
    { title: "Feed: A", bookmarkFolderId: "folderA" },
    { title: "Feed/B", bookmarkFolderId: "folderB" },
    { title: "No Folder" }
  ]);

  assert.equal(exported, 2);
  assert.deepEqual(writes, [
    {
      folderName: "Feed_ A",
      fileName: "First_ Item.url",
      content: "[InternetShortcut]\r\nURL=https://example.test/first?x=1\r\n"
    },
    {
      folderName: "Feed_B",
      fileName: "Second _Item_.url",
      content: "[InternetShortcut]\r\nURL=https://example.test/second\r\n"
    }
  ]);
});

test("exports one feed folder and reports empty folders", async () => {
  const writes = installExportMocks({
    folderA: [{ title: "One", url: "https://example.test/one" }],
    empty: [{ title: "Folder Only" }]
  });

  assert.equal(await exportFeedToFolder("folderA"), 1);
  assert.deepEqual(writes, [
    {
      folderName: "root",
      fileName: "One.url",
      content: "[InternetShortcut]\r\nURL=https://example.test/one\r\n"
    }
  ]);

  await assert.rejects(
    () => exportFeedToFolder("empty"),
    /No bookmarks to export/
  );
});
