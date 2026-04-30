# Changelog

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
