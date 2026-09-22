import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const EXPECTED_NAV_ITEMS = [
  "system-architecture",
  "core-mission--key-benefits",
  "target-personas--use-cases",
  "high-intent-search-queries--seo",
  "comparative-matrix--alternatives",
  "installation--browser-stores",
  "quick-start--how-it-works",
  "features--capabilities",
  "product-screenshots",
  "feed-discovery--opml-portability",
  "bookmark-management--retention",
  "permissions--privacy-policy",
  "project-structure",
  "development--test-suite",
  "packaging--edge-preflight",
  "internationalization--locales",
  "sibling-projects--ecosystem",
  "license--statutory-liability",
];

test("metadata: README.md and README_de.md both exist and have 18-point quick navigation parity", () => {
  const readmeEn = readText("README.md");
  const readmeDe = readText("README_de.md");

  assert.ok(readmeEn.includes("# Quick Navigation") || readmeEn.includes("## Quick Navigation"), "README.md must have Quick Navigation section");
  assert.ok(readmeDe.includes("# Schnellübersicht") || readmeDe.includes("## Schnellübersicht"), "README_de.md must have Schnellübersicht section");

  for (let i = 0; i < EXPECTED_NAV_ITEMS.length; i += 1) {
    const item = EXPECTED_NAV_ITEMS[i];
    const num = i + 1;
    
    // Check anchors exist in English README
    assert.ok(
      readmeEn.includes(`id="${item}"`) || readmeEn.includes(`id="${num}-${item}"`),
      `README.md must include anchor for ${num}. ${item}`
    );

    // Check anchors exist in German README
    assert.ok(
      readmeDe.includes(`id="${item}"`) || readmeDe.includes(`id="${num}-${item}"`),
      `README_de.md must include reciprocal anchor for ${num}. ${item}`
    );
  }
});

test("metadata: Target Personas [PERSONA-01] through [PERSONA-04] are documented in both READMEs", () => {
  const readmeEn = readText("README.md");
  const readmeDe = readText("README_de.md");

  for (const persona of ["[PERSONA-01]", "[PERSONA-02]", "[PERSONA-03]", "[PERSONA-04]"]) {
    assert.ok(readmeEn.includes(persona), `README.md missing ${persona}`);
    assert.ok(readmeDe.includes(persona), `README_de.md missing ${persona}`);
  }
});

test("metadata: Comparative matrix against 4 alternatives is documented in both READMEs", () => {
  const readmeEn = readText("README.md");
  const readmeDe = readText("README_de.md");

  for (const alt of ["Feedly", "Inoreader", "Feedbro", "Fluent Reader"]) {
    assert.ok(readmeEn.includes(alt), `README.md missing alternative ${alt}`);
    assert.ok(readmeDe.includes(alt), `README_de.md missing alternative ${alt}`);
  }

  for (const inv of ["INV-LOCAL-01", "INV-LOCAL-05", "INV-LOCAL-10"]) {
    assert.ok(readmeEn.includes(inv), `README.md missing invariant ${inv}`);
    assert.ok(readmeDe.includes(inv), `README_de.md missing invariant ${inv}`);
  }
});

test("metadata: Statutory liability notice (§ 521 BGB) is present in both READMEs", () => {
  const readmeEn = readText("README.md");
  const readmeDe = readText("README_de.md");

  assert.ok(readmeEn.includes("§ 521"), "README.md missing § 521 BGB notice");
  assert.ok(readmeDe.includes("§ 521 BGB"), "README_de.md missing § 521 BGB notice");
  assert.ok(readmeDe.includes("Gefälligkeitsrecht") || readmeDe.includes("Schenkung"), "README_de.md missing statutory clause");
});

test("metadata: Dual Mermaid diagrams exist in both READMEs (Topology and SequenceDiagram with autonumber)", () => {
  const readmeEn = readText("README.md");
  const readmeDe = readText("README_de.md");

  assert.ok(readmeEn.includes("flowchart TD"), "README.md missing flowchart TD");
  assert.ok(readmeEn.includes("sequenceDiagram"), "README.md missing sequenceDiagram");
  assert.ok(readmeEn.includes("autonumber"), "README.md sequenceDiagram missing autonumber");

  assert.ok(readmeDe.includes("flowchart TD"), "README_de.md missing flowchart TD");
  assert.ok(readmeDe.includes("sequenceDiagram"), "README_de.md missing sequenceDiagram");
  assert.ok(readmeDe.includes("autonumber"), "README_de.md sequenceDiagram missing autonumber");
});

test("metadata: llms.txt has no merge conflicts, is updated, and reflects architecture", () => {
  const llms = readText("llms.txt");

  assert.equal(llms.includes("<<<<<<<"), false, "llms.txt contains git merge conflict marker");
  assert.equal(llms.includes("======="), false, "llms.txt contains git merge conflict marker");
  assert.equal(llms.includes(">>>>>>>"), false, "llms.txt contains git merge conflict marker");

  assert.ok(llms.includes("Last-checked: 2026-09-22"), "llms.txt Last-checked must be 2026-09-22");
  assert.ok(llms.includes("[PERSONA-01]"), "llms.txt must reference target personas");
  assert.ok(llms.includes("Quick Navigation"), "llms.txt must reference quick navigation");
});

test("metadata: MARKETING-LOG.txt exists and records Pfad B discoverability audit", () => {
  assert.ok(fs.existsSync(path.join(rootDir, "MARKETING-LOG.txt")), "MARKETING-LOG.txt must exist");
  const log = readText("MARKETING-LOG.txt");
  assert.ok(log.includes("Pfad B"), "MARKETING-LOG.txt must record Pfad B audit");
  assert.ok(log.includes("2026-09-18"), "MARKETING-LOG.txt must record date 2026-09-18");
});

test("metadata: CI workflow (.github/workflows/ci.yml) has concurrency, timeout, and multi-OS matrix", () => {
  const ci = readText(".github/workflows/ci.yml");
  assert.ok(ci.includes("concurrency:"), "ci.yml must define concurrency group");
  assert.ok(ci.includes("cancel-in-progress: true"), "ci.yml must cancel in-progress runs");
  assert.ok(ci.includes("timeout-minutes: 15"), "ci.yml must set job timeout");
  assert.ok(ci.includes("ubuntu-latest") && ci.includes("windows-latest"), "ci.yml must cover ubuntu and windows matrix");
  assert.ok(ci.includes("actions/checkout@v4"), "ci.yml must use checkout@v4");
  assert.ok(ci.includes("actions/setup-node@v4"), "ci.yml must use setup-node@v4");
  assert.ok(ci.includes("npm run edge-preflight"), "ci.yml must validate edge-preflight");
  assert.ok(ci.includes("npm run package"), "ci.yml must validate package build");
});

test("metadata: Stale and Welcome workflows have timeout-minutes and security guardrails", () => {
  const stale = readText(".github/workflows/stale.yml");
  const welcome = readText(".github/workflows/welcome.yml");
  assert.ok(stale.includes("timeout-minutes: 10"), "stale.yml must set timeout-minutes");
  assert.ok(stale.includes("concurrency:"), "stale.yml must define concurrency");
  assert.ok(welcome.includes("timeout-minutes: 5"), "welcome.yml must set timeout-minutes");
  assert.ok(welcome.includes("concurrency:"), "welcome.yml must define concurrency");
  assert.ok(welcome.includes("actions/first-interaction@v3"), "welcome.yml must use first-interaction@v3");
});

test("metadata: .gitignore protects against multi-host conflict files and lock patterns", () => {
  const gitignore = readText(".gitignore");
  assert.ok(gitignore.includes("*conflicted copy*"), "gitignore must ignore conflicted copies");
  assert.ok(gitignore.includes("*-WORKSTATION*"), "gitignore must ignore WORKSTATION copies");
  assert.ok(gitignore.includes("*-ASUS*"), "gitignore must ignore ASUS copies");
  assert.ok(gitignore.includes("LOCK.user.*"), "gitignore must ignore LOCK.user.*");
  assert.ok(gitignore.includes("!package-lock.json"), "gitignore must preserve package-lock.json");
});

test("metadata: SECURITY.md documents supported versions and SLA", () => {
  const sec = readText("SECURITY.md");
  assert.ok(sec.includes("1.1.x"), "SECURITY.md must list 1.1.x as supported");
  assert.ok(sec.includes("security@open-bricks.org"), "SECURITY.md must list umbrella security contact");
  assert.ok(sec.includes("48"), "SECURITY.md must commit to 48h initial response SLA");
});

test("metadata: package.json specifies repository, bugs, and homepage metadata", () => {
  const pkg = JSON.parse(readText("package.json"));
  assert.equal(pkg.license, "MIT", "package.json license must be MIT");
  assert.ok(pkg.repository && pkg.repository.url.includes("RSS-BOOK"), "package.json must contain repository url");
  assert.ok(pkg.bugs && pkg.bugs.url.includes("RSS-BOOK"), "package.json must contain bugs url");
  assert.ok(pkg.homepage && pkg.homepage.includes("RSS-BOOK"), "package.json must contain homepage url");
});
