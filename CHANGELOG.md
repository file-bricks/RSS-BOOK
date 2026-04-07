# Changelog

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
