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
  assert.equal(Array.isArray(manifest.icons), false, "extension manifest icons must be a size-to-path object");

  for (const iconPath of Object.values(manifest.icons)) {
    assertExists(iconPath);
  }

  const localeDirs = fs
    .readdirSync(path.join(rootDir, "_locales"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(localeDirs.includes("en"), "en locale directory must exist");
  assert.ok(localeDirs.includes("de"), "de locale directory must exist");
  assert.ok(localeDirs.includes("es"), "es locale directory must exist");

  for (const locale of localeDirs) {
    assertExists(`_locales/${locale}/messages.json`);
  }
});

test("all bundled locales provide the canonical message keys and placeholders", () => {
  const englishMessages = readJson("_locales/en/messages.json");
  const englishKeys = Object.keys(englishMessages).sort();

  const localeDirs = fs
    .readdirSync(path.join(rootDir, "_locales"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(localeDirs.length >= 3, "at least en, de, and es locales must be present");

  for (const locale of localeDirs) {
    const messages = readJson(`_locales/${locale}/messages.json`);
    const keys = Object.keys(messages).sort();

    assert.deepEqual(keys, englishKeys, `${locale} must match English message keys`);

    for (const key of englishKeys) {
      const enItem = englishMessages[key];
      const locItem = messages[key];

      assert.equal(
        typeof locItem.message,
        "string",
        `${locale}.${key}.message must be a string`
      );
      assert.ok(
        locItem.message.trim().length > 0,
        `${locale}.${key}.message must not be empty`
      );

      if (enItem.placeholders) {
        assert.ok(
          locItem.placeholders,
          `${locale}.${key} must declare placeholders matching English`
        );
        assert.deepEqual(
          Object.keys(locItem.placeholders).sort(),
          Object.keys(enItem.placeholders).sort(),
          `${locale}.${key} placeholder keys must match English`
        );
        for (const ph of Object.keys(enItem.placeholders)) {
          assert.equal(
            locItem.placeholders[ph]?.content,
            enItem.placeholders[ph]?.content,
            `${locale}.${key}.placeholders.${ph}.content must match English`
          );
        }
      }
    }
  }
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
});
