import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runEdgePreflight } from "../scripts/edge-preflight.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("edge preflight validates upload package and store assets", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-book-edge-preflight-"));

  try {
    const result = await runEdgePreflight({ rootDir, outputDir: tempDir, quiet: true });

    assert.equal(result.status, "OK");
    assert.equal(result.version, "1.1.2");
    assert.equal(result.listing.name, "RSS-BOOK");
    assert.match(result.listing.description, /bookmarks/i);
    assert.equal(result.assets.storeIcon.width, 300);
    assert.equal(result.assets.storeIcon.height, 300);
    assert.ok(result.assets.screenshots.length >= 3);
    assert.ok(result.package.relativePath.endsWith("-edge.zip"));
    assert.equal(fs.existsSync(result.package.path), true);
    assert.equal(fs.existsSync(path.join(tempDir, "EDGE_ADDONS_PREFLIGHT.md")), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("edge preflight can run as validation without writing report", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-book-edge-preflight-no-report-"));

  try {
    const result = await runEdgePreflight({
      rootDir,
      outputDir: tempDir,
      writeReport: false,
      quiet: true,
    });

    assert.equal(result.status, "OK");
    assert.equal(fs.existsSync(path.join(tempDir, "EDGE_ADDONS_PREFLIGHT.md")), false);
    assert.equal(fs.existsSync(result.package.path), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
