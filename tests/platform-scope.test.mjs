import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("porting plan keeps RSS-BOOK browser-extension first", () => {
  const plan = readText("PORTIERUNGSPLAN.md").toLowerCase();

  assert.match(plan, /browser-extension/);
  assert.match(plan, /chrome web store/);
  assert.match(plan, /edge add-ons/);
  assert.match(plan, /windows desktop-app \| nicht-ziel/);
  assert.match(plan, /macos desktop-app \| nicht-ziel/);
  assert.match(plan, /linux desktop-app \| nicht-ziel/);
  assert.match(plan, /android app \| nicht-ziel/);
  assert.match(plan, /ios app \| nicht-ziel/);
  assert.match(plan, /web\/pwa \| nicht-ziel/);
  assert.match(plan, /rss-book synchronisiert nicht selbst/);
});

test("project does not grow native, mobile, or pwa product scaffolds", () => {
  const rejectedRoots = [
    "android",
    "capacitor",
    "desktop_app",
    "electron",
    "flutter_port",
    "ios",
    "pwa",
    "tauri",
    "web_companion",
  ];

  for (const relativePath of rejectedRoots) {
    assert.equal(
      fs.existsSync(path.join(rootDir, relativePath)),
      false,
      `${relativePath} would start a non-browser product line`
    );
  }
});

test("task list records the platform-scope gate as closed", () => {
  const tasks = readText("AUFGABEN.txt");

  assert.match(
    tasks,
    /\[x\] Keine native Desktop-App, keine Android-\/iOS-App und keine PWA-Produktlinie starten[\s\S]*DONE 2026-07-03/
  );
});
