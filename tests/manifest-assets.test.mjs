import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function assertExists(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  assert.equal(fs.existsSync(fullPath), true, `${relativePath} should exist`);
  return fullPath;
}

function pngSize(relativePath) {
  const buffer = fs.readFileSync(assertExists(relativePath));
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${relativePath} must be a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

test("manifest references existing icons and locale files", () => {
  const manifest = readJson("manifest.json");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.default_locale, "en");

  for (const iconPath of Object.values(manifest.icons)) {
    assertExists(iconPath);
  }

  assertExists("_locales/en/messages.json");
  assertExists("_locales/de/messages.json");
});

test("store icon and screenshot assets have release-ready dimensions", () => {
  assert.deepEqual(pngSize("icons/300.png"), { width: 300, height: 300 });

  const screenshotFiles = fs
    .readdirSync(path.join(rootDir, "assets"))
    .filter((name) => /^screenshot-\d+-.*\.png$/i.test(name))
    .sort();

  assert.ok(screenshotFiles.length >= 3, "at least three store screenshots are required");
  for (const fileName of screenshotFiles) {
    assert.deepEqual(pngSize(path.join("assets", fileName)), { width: 1280, height: 800 });
  }

  assert.deepEqual(pngSize("README/screenshots/main_view.png"), { width: 1280, height: 800 });
});
