# Privacy Policy — RSS-BOOK

**Last updated:** 2026-04-30

## Summary

RSS-BOOK does **not** collect personal data or send it to the developer. Settings and bookmark data stay in your browser; network requests are limited to the feed-related actions described below.

## What data does RSS-BOOK access?

- **Feed URLs you configure:** RSS-BOOK fetches RSS/Atom feeds from the URLs you add. These requests go directly from your browser to the feed servers — no intermediary, no proxy, no third-party service.
- **Current tab on explicit discovery:** When you click "Discover feeds", RSS-BOOK scans the current tab for RSS/Atom links and may probe common feed paths on that site's origin. This action is user-triggered.
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

RSS-BOOK makes HTTP requests to:

- RSS/Atom feed URLs you explicitly configure
- common feed paths on the current site's origin when you click "Discover feeds"

No data is sent to the developer or any third party. There is no telemetry, analytics, advertising, or proxy service.

## Host permissions (`<all_urls>`)

RSS-BOOK requests the `<all_urls>` host permission because RSS/Atom feeds can be hosted on any domain. This permission is used for fetching configured feed content and for user-triggered feed discovery on the current site's origin.

## Data storage

All data is stored locally using the `chrome.storage.local` API:
- Feed configurations (URLs, settings, cache headers)
- Global settings (update interval, startup behavior)

No data is stored on external servers.

## Changes to this policy

If this policy changes, the updated version will be published in this repository. The "Last updated" date at the top will reflect the most recent revision.

## Contact

For questions about this privacy policy, open an issue in this repository.
