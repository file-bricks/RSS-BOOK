import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { exportAllFeedsToFolder, exportFeedToFolder, sanitizeFilename } from "../lib/export.js";

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

test("sanitizeFilename handles Windows reserved device names safely", () => {
  assert.equal(sanitizeFilename("CON"), "_CON");
  assert.equal(sanitizeFilename("con"), "_con");
  assert.equal(sanitizeFilename("PRN"), "_PRN");
  assert.equal(sanitizeFilename("AUX"), "_AUX");
  assert.equal(sanitizeFilename("aux"), "_aux");
  assert.equal(sanitizeFilename("NUL"), "_NUL");
  assert.equal(sanitizeFilename("COM1"), "_COM1");
  assert.equal(sanitizeFilename("com9"), "_com9");
  assert.equal(sanitizeFilename("LPT1"), "_LPT1");
  assert.equal(sanitizeFilename("lpt5"), "_lpt5");
});

test("sanitizeFilename strips illegal characters, trailing dots, trailing spaces, and control characters", () => {
  assert.equal(sanitizeFilename("Tech Review..."), "Tech Review");
  assert.equal(sanitizeFilename("Feed with trailing spaces   "), "Feed with trailing spaces");
  assert.equal(sanitizeFilename("Folder: Sub / Section * ? < > | \""), "Folder_ Sub _ Section _ _ _ _ _ _");
  assert.equal(sanitizeFilename("Line\x00Break\x1fTest"), "Line_Break_Test");
  assert.equal(sanitizeFilename("..."), "unnamed");
  assert.equal(sanitizeFilename(""), "unnamed");
  assert.equal(sanitizeFilename(null), "unnamed");
});

test("exports feeds with reserved names and OneDrive-critical characters without filesystem collisions", async () => {
  const writes = installExportMocks({
    resFolder: [
      { title: "CON", url: "https://example.test/con" },
      { title: "Review...", url: "https://example.test/review" }
    ]
  });

  const exported = await exportAllFeedsToFolder([
    { title: "AUX", bookmarkFolderId: "resFolder" }
  ]);

  assert.equal(exported, 2);
  assert.deepEqual(writes, [
    {
      folderName: "_AUX",
      fileName: "_CON.url",
      content: "[InternetShortcut]\r\nURL=https://example.test/con\r\n"
    },
    {
      folderName: "_AUX",
      fileName: "Review.url",
      content: "[InternetShortcut]\r\nURL=https://example.test/review\r\n"
    }
  ]);
});

test("exportAllFeedsToFolder throws when no feeds have bookmark folders", async () => {
  await assert.rejects(
    () => exportAllFeedsToFolder([{ title: "No Folder Feed" }]),
    /No feeds with bookmark folders/
  );
});
