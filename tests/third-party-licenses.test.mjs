import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function activeRequirementLines() {
  return readText("requirements.txt")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

test("third-party license inventory matches dependency-free package manifests", () => {
  const manifest = readJson("package.json");
  const inventory = readText("THIRD_PARTY_LICENSES.txt");

  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert.equal(
      Object.keys(manifest[field] ?? {}).length,
      0,
      `${field} changed; update THIRD_PARTY_LICENSES.txt`
    );
  }

  assert.equal(
    Object.keys(manifest.devDependencies ?? {}).length,
    0,
    "devDependencies changed; update THIRD_PARTY_LICENSES.txt"
  );
  assert.deepEqual(activeRequirementLines(), [], "requirements.txt gained active dependencies");

  assert.match(inventory, /Direct Package Dependencies\s+-+\s+None\./);
  assert.match(inventory, /Python Dependencies\s+-+\s+None\./);
  assert.match(inventory, /no third-party package/i);
});
