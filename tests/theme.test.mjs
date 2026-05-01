import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readHtml(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function extractStyle(html, relativePath) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/i);
  assert.ok(match, `${relativePath} should include inline CSS`);
  return match[1];
}

function extractVariableSet(block) {
  const variables = new Map();
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    variables.set(match[1], match[2].trim());
  }
  return variables;
}

function extractThemeBlocks(css, relativePath) {
  const lightMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
  assert.ok(lightMatch, `${relativePath} should define light :root variables`);

  const darkMatch = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}\s*\}/);
  assert.ok(darkMatch, `${relativePath} should define a dark prefers-color-scheme override`);

  return {
    light: extractVariableSet(lightMatch[1]),
    dark: extractVariableSet(darkMatch[1])
  };
}

function extractUsedVariables(css) {
  return new Set(Array.from(css.matchAll(/var\(--([a-z0-9-]+)\)/gi), (match) => match[1]));
}

function assertThemeCoverage(relativePath, pageSpecificVariables = []) {
  const html = readHtml(relativePath);
  const css = extractStyle(html, relativePath);
  const { light, dark } = extractThemeBlocks(css, relativePath);

  const requiredVariables = [
    "bg",
    "text",
    "text-muted",
    "border",
    "btn-bg",
    "btn-hover",
    "btn-border",
    "accent",
    "accent-hover",
    "error",
    "success",
    ...pageSpecificVariables
  ];

  for (const variable of requiredVariables) {
    assert.ok(light.has(variable), `${relativePath} light theme should define --${variable}`);
    assert.ok(dark.has(variable), `${relativePath} dark theme should define --${variable}`);
  }

  for (const variable of extractUsedVariables(css)) {
    assert.ok(light.has(variable), `${relativePath} uses --${variable} in CSS but does not define it for light mode`);
    assert.ok(dark.has(variable), `${relativePath} uses --${variable} in CSS but does not define it for dark mode`);
  }

  assert.notEqual(light.get("bg"), dark.get("bg"), `${relativePath} dark mode should override --bg`);
  assert.notEqual(light.get("text"), dark.get("text"), `${relativePath} dark mode should override --text`);
  assert.notEqual(light.get("border"), dark.get("border"), `${relativePath} dark mode should override --border`);
  assert.match(css, /body\s*\{[^}]*color:\s*var\(--text\)[^}]*background:\s*var\(--bg\)/s);
}

test("popup page has complete light and dark theme variables", () => {
  assertThemeCoverage("ui/popup.html", ["discover-bg", "discover-border"]);
});

test("options page has complete light and dark theme variables", () => {
  assertThemeCoverage("ui/options.html", [
    "input-border",
    "input-bg",
    "card-bg",
    "section-bg",
    "info-bg",
    "info-border"
  ]);
});
