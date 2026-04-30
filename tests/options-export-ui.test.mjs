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

function installOptionsPage({ feeds }) {
  const elements = new Map();
  for (const id of [
    "updateOnStartup",
    "globalInterval",
    "rootFolderName",
    "deleteBookmarks",
    "saveSettings",
    "addBtn",
    "feedUrl",
    "importOPMLBtn",
    "opmlFileInput",
    "exportOPMLBtn",
    "exportAllFoldersBtn",
    "feedList",
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
        if (key === "popupError") return `error:${substitutions[0]}`;
        return key;
      }
    },
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.map((key) => [
            key,
            key === "feeds" ? feeds : undefined
          ]));
        },
        async set() {}
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

  return { elements, writes };
}

test("options page exposes folder export button", () => {
  const html = fs.readFileSync(path.join(rootDir, "ui", "options.html"), "utf8");

  assert.match(html, /id="exportAllFoldersBtn"/);
  assert.match(html, /data-i18n="optionsExportAllFolders"/);
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
