# Changelog

## [Unreleased]

### Added
- Added `browser_specific_settings.gecko` block to `manifest.json` (`id: rss-book@file-bricks`, `strict_min_version: 128.0`) — required for Firefox AMO submission.
- Added `tests/firefox-compat.test.mjs` with four manifest-level AMO-eligibility checks (gecko.id, strict_min_version, service_worker, no MV2 scripts).
- Added `FIREFOX_AMO.md` documenting the Firefox compatibility matrix, API deltas, three runtime blockers (background.service_worker not supported, chrome.* callbacks-only, showDirectoryPicker unavailable), and an estimated migration effort of 2–3 working days.
- Added `tests/bugsweep-20260611.test.mjs` with 9 regression tests covering Bugs A–D.
- Added `llms.txt` with canonical links, feature summary, developer commands, and search phrases for crawler/LLM discovery.
- Added README links to the live Chrome Web Store listing and GitHub Releases page.
- Added README product screenshot gallery using the existing store screenshots.
- Added options-page lifecycle diagnostics for service-worker boot, alarm cadence, and recent update-cycle activity.
- Added automated light/dark theme coverage for popup and options CSS variables.
- Added a read-only GitHub Actions CI workflow for the Node test suite.
- Added regression coverage for service-worker alarm scheduling.
- Added a dependency-free Edge upload ZIP packager via `npm run package`.
- Added a 10-fixture RSS/Atom parser matrix covering WordPress-style RSS, podcast RSS, FeedBurner-style RSS, Media RSS, RSS 1.0/RDF, and common Atom feed variants.

### Fixed
- **Bug A (options.js):** OPML export now appends the download anchor to `document.body` before `.click()` and defers `revokeObjectURL` via `setTimeout` — fixes silent export failure in Firefox.
- **Bug B (storage.js):** Added `withFeedLock` promise-chaining mutex; `upsertFeed` and `removeFeed` now serialize under this lock to prevent concurrent writes from losing data.
- **Bug C (sw.js):** Added `_cycleInFlight` guard to `runUpdateCycle`; overlapping alarm or startup triggers now coalesce onto the running promise instead of spawning parallel cycles.
- **Bug D (storage.js):** Added `mergeFeedSeen(feedId, delta)` that merges seen-entry deltas atomically under `withFeedLock` and trims the seen set to a maximum of 800 entries (oldest removed first).
- Restored `icons` field in `manifest.json` to the correct browser-extension dict format (`{16, 48, 128}`) after a previous session had changed it to a PWA-style array, which broke three existing packaging tests.
- Booting the service worker now refreshes stored alarm diagnostics even before `onStartup` or manual settings changes run.
- Fixed alarm updates for manual-only feeds when global interval is disabled but other feeds define per-feed intervals.
- Fixed RSS and Atom text parsing so CDATA wrappers are removed from feed titles, item titles, links, and Atom dates.
- Fixed OPML imports so duplicate feed URLs inside the same file are only imported once.
- Fixed OPML imports so `xmlUrl` values are trimmed before feed records are stored.
- Fixed OPML title decoding for numeric XML entities.
- Fixed RSS 1.0/RDF parsing so item blocks outside the channel block are no longer ignored.
- Fixed bookmark fallback hashing to use integer-safe `Math.imul` FNV-1a behavior.
- Normalized the German locale file to real UTF-8 Umlaute instead of escaped code points.

### Changed
- Added `LOCK*.txt` to `.gitignore` so local multi-agent coordination locks stay
  out of public extension releases.
- Refreshed README and `llms.txt` discovery metadata for Chrome Web Store,
  Edge/Chromium, bookmark-sync, no-account RSS, and local-first feed-reader
  searches.
- Added package keywords for GitHub/package metadata indexing even though the
  extension is not published to npm.
- Clarified README positioning for bookmark-based RSS reader and Chrome Web Store search queries.
- Added repository line-ending rules, explicitly ignored local pytest caches, and updated the README Edge packaging note.
- Removed an unused README screenshot reference after the asset was dropped.

### Verified
- 51/51 tests pass (`npm test`), covering the 10-feed parser matrix, CDATA cleanup, theme, service-worker scheduling, lifecycle diagnostics, OPML entity/URL normalization, hashing, package-content coverage, Firefox AMO eligibility, and Bugs A–D regression.
- `npm run package` creates `dist/RSS-BOOK-v1.1.2-edge.zip` with the Manifest V3 runtime files plus license/privacy docs.

## [1.1.2] — 2026-04-30

### Added
- Expanded feed discovery to include visible feed links and common feed paths on the current site's origin.
- Added README screenshot reference and extension helper files for easier local installation.
- Added a dependency-free Node test suite for RSS/Atom parsing, OPML import/export, storage handling, folder export, and store asset checks.
- Added automated bookmark tests for root-folder recovery, dedupe/LRU behavior, and retention cleanup.
- Added the options-page button for exporting all feed bookmark folders as `.url` files.
- Added automated options-page coverage for the folder export UI.

### Changed
- Updated README permissions and privacy wording to match the activeTab/scripting discovery flow.
- Updated privacy policy, security policy, contributing guide, code of conduct, and `.gitignore` for public repository hygiene.
- Documented folder export as available from the options page.
- Extracted feed-discovery helpers from the service worker into a testable module.
- Bumped extension manifest version to 1.1.2.

### Verified
- Store icon (`icons/300.png`) and Store/README screenshots are checked for release-ready PNG dimensions.

## [1.1.1] — 2026-04-08

### Fixed
- Service worker failed to start with `import() is disallowed on ServiceWorkerGlobalScope` — removed an unnecessary dynamic `import()` in `lib/bookmarks.js` (was guarding against a non-existent circular dependency). `upsertFeed` is now statically imported.

## [1.1.0] — 2026-04-07

### Added
- **OPML Import/Export** — migrate feeds from/to other readers (Feedly, Thunderbird, etc.)
- **i18n** — English UI (default) with German translation via Chrome i18n API
- **Dark Mode** — automatic via `prefers-color-scheme`, popup and options page
- ~~Folder Export~~ — deferred to future release (browser security restrictions)
- **Feed Autodiscovery** — detect RSS/Atom feeds on the current page via `<link rel="alternate">`
- **Error Handling** — per-feed error display in popup and options (no longer silent failures)
- **Configurable root folder** — bookmark folder name can be changed in settings (default: "RSS")

### Fixed
- Root folder tracked by ID instead of name — renaming or moving the RSS folder no longer creates duplicates
- Alarm logic uses smallest per-feed interval as fallback when global interval is 0
- Atom link extraction works regardless of attribute order (`rel="alternate"` + `href`)

### Changed
- Version bumped to 1.1.0
- Added `activeTab` and `scripting` permissions for feed autodiscovery
- UI uses CSS custom properties for consistent theming

## [1.0.0] — 2026-04-07

### Added
- MV3 browser extension for RSS/Atom feed management via bookmarks
- RSS 2.0 and Atom feed parsing (regex-based, no DOMParser — MV3 compatible)
- Automatic bookmark folder creation per feed under "RSS" root folder
- ETag/Last-Modified caching for bandwidth-efficient feed updates
- Per-feed update intervals and global alarm-based scheduling
- Bookmark retention with configurable auto-cleanup (days)
- Deduplication via LRU cache (800 entries per feed)
- Desktop notifications for new feed entries
- Popup UI with feed overview and manual update trigger
- Options page with feed management (add, configure, unsubscribe)
- Unsubscribe removes feed config but preserves bookmarks
