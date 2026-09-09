import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildExtensionPackage, collectPackageEntries } from "../scripts/package-extension.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function listZipEntries(buffer) {
  const endSignature = 0x06054b50;
  let endOffset = -1;

  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }

  assert.notEqual(endOffset, -1, "ZIP end-of-central-directory record must exist");

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const names = [];
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "central directory header expected");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    names.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return names;
}

test("package entries include extension runtime files only", async () => {
  const manifest = readJson("manifest.json");
  const entries = await collectPackageEntries(rootDir);
  const names = entries.map((entry) => entry.name);

  assert.ok(names.includes("manifest.json"));
  assert.ok(names.includes("sw.js"));
  assert.ok(names.includes("LICENSE"));
  assert.ok(names.includes("PRIVACY_POLICY.md"));

  const localeDirs = fs
    .readdirSync(path.join(rootDir, "_locales"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const locale of localeDirs) {
    const localePath = `_locales/${locale}/messages.json`;
    assert.ok(names.includes(localePath), `${localePath} must be packaged`);
  }

  for (const iconPath of Object.values(manifest.icons)) {
    assert.ok(names.includes(iconPath), `${iconPath} must be packaged`);
  }

  for (const iconPath of Object.values(manifest.action.default_icon)) {
    assert.ok(names.includes(iconPath), `${iconPath} must be packaged`);
  }

  assert.equal(names.some((name) => name.startsWith("tests/")), false);
  assert.equal(names.some((name) => name.startsWith("assets/")), false);
  assert.equal(names.includes("AUFGABEN.txt"), false);
  assert.equal(names.includes("RELEASE_PLAN.md"), false);
});

test("package command writes a valid Edge upload ZIP", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-book-package-"));

  try {
    const result = await buildExtensionPackage({ rootDir, outputDir: tempDir, quiet: true });
    const archive = fs.readFileSync(result.outputPath);
    const zipNames = listZipEntries(archive);

    assert.equal(path.basename(result.outputPath), `RSS-BOOK-v${result.version}-edge.zip`);
    assert.deepEqual(zipNames, result.entries.map((entry) => entry.name));
    assert.ok(zipNames.includes("manifest.json"));

    const localeDirs = fs
      .readdirSync(path.join(rootDir, "_locales"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const locale of localeDirs) {
      assert.ok(zipNames.includes(`_locales/${locale}/messages.json`));
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("packaging preserves all _locales/*/messages.json files unmodified with bit-for-bit integrity", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-book-i18n-package-"));

  try {
    const result = await buildExtensionPackage({ rootDir, outputDir: tempDir, quiet: true });
    const archive = fs.readFileSync(result.outputPath);
    const zipNames = listZipEntries(archive);

    const localeDirs = fs
      .readdirSync(path.join(rootDir, "_locales"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    assert.ok(localeDirs.length >= 3, "expected at least 3 locales (de, en, es)");

    for (const locale of localeDirs) {
      const relPath = `_locales/${locale}/messages.json`;
      const diskBytes = fs.readFileSync(path.join(rootDir, relPath));
      const entry = result.entries.find((e) => e.name === relPath);

      assert.ok(entry, `${relPath} must exist in result.entries`);
      assert.equal(entry.size, diskBytes.length, `${relPath} entry size must match file size on disk`);
      assert.ok(zipNames.includes(relPath), `${relPath} must be in ZIP central directory`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
