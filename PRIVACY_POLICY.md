# Privacy Policy — RSS-BOOK

**Last updated:** 2026-04-07

## Summary

RSS-BOOK does **not** collect, transmit, or store any personal data. Everything stays in your browser.

## What data does RSS-BOOK access?

- **Feed URLs you configure:** RSS-BOOK fetches RSS/Atom feeds from the URLs you add. These requests go directly from your browser to the feed servers — no intermediary, no proxy, no third-party service.
- **Bookmarks:** RSS-BOOK creates and manages bookmark folders and entries in your browser's bookmark system. All bookmark data stays local.
- **Extension storage:** Your feed list, settings, and cache metadata (ETags, timestamps) are stored in `chrome.storage.local` — local to your browser, never synced or transmitted.

## What data does RSS-BOOK NOT access?

- No browsing history
- No cookies or session data
- No personal information
- No analytics or telemetry
- No crash reports
- No advertising identifiers

## Network requests

RSS-BOOK makes HTTP requests **only** to the feed URLs you explicitly configure. No other network requests are made. No data is sent to the developer or any third party.

## Host permissions (`<all_urls>`)

RSS-BOOK requests the `<all_urls>` host permission because RSS/Atom feeds can be hosted on any domain. This permission is used exclusively for fetching feed content — nothing else.

## Data storage

All data is stored locally using the `chrome.storage.local` API:
- Feed configurations (URLs, settings, cache headers)
- Global settings (update interval, startup behavior)

No data is stored on external servers.

## Changes to this policy

If this policy changes, the updated version will be published in this repository. The "Last updated" date at the top will reflect the most recent revision.

## Contact

For questions about this privacy policy, open an issue in this repository.
