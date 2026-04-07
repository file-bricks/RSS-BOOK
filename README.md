# RSS-BOOK

**Lightweight RSS/Atom feed reader that saves entries as browser bookmarks.**

No account. No cloud. No tracking. Just feeds → bookmarks.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)
![Privacy](https://img.shields.io/badge/Privacy-No%20Tracking-brightgreen)

---

## How it works

1. Add RSS or Atom feed URLs in the options page
2. RSS-BOOK creates a bookmark folder per feed under an "RSS" root folder
3. New entries are automatically saved as bookmarks
4. Old entries are cleaned up based on your retention settings

Your feeds live in your bookmarks — accessible everywhere your browser syncs, without a separate app.

## Features

- **Manifest V3 native** — built for modern Chromium browsers
- **RSS 2.0 + Atom** — both formats supported
- **ETag/304 caching** — bandwidth-efficient, respects server cache headers
- **Per-feed intervals** — each feed can have its own update schedule
- **Retention** — auto-remove bookmarks older than N days
- **Notifications** — desktop alerts for new entries
- **Privacy-first** — zero data collection, zero telemetry, zero network calls except your feeds
- **Unsubscribe preserves bookmarks** — remove a feed, keep the entries

## Install

### From GitHub (Chrome, Edge, Brave, Vivaldi)

1. Download or clone this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `RSS-BOOK` folder

### Edge Add-ons (coming soon)

Store listing planned for v1.1.

## Usage

**Popup** — click the extension icon to see your feeds and trigger a manual update.

**Options** — right-click the icon → *Options* (or open from popup) to:
- Add/remove feeds
- Set update intervals (global or per-feed)
- Configure retention (auto-cleanup after N days)
- Toggle notifications

## Permissions

| Permission | Why |
|---|---|
| `bookmarks` | Create and manage feed bookmark folders |
| `storage` | Store feed config and cache metadata locally |
| `alarms` | Schedule periodic feed updates |
| `notifications` | Alert you about new feed entries |
| `<all_urls>` | Fetch feeds from any domain (feeds can be hosted anywhere) |

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details.

## Project structure

```
RSS-BOOK/
├── manifest.json        # MV3 extension manifest
├── sw.js                # Service worker (background)
├── lib/
│   ├── rss.js           # RSS/Atom parser (regex-based)
│   ├── bookmarks.js     # Bookmark folder/item management
│   └── storage.js       # chrome.storage.local wrapper
├── ui/
│   ├── popup.html/js    # Extension popup
│   └── options.html/js  # Settings page
└── icons/               # Extension icons (16, 48, 128)
```

## Roadmap (v1.1)

- [ ] OPML import/export
- [ ] English UI (i18n)
- [ ] Dark mode
- [ ] Folder export (File System Access API)
- [ ] Feed autodiscovery (`<link rel="alternate">`)

## License

[MIT](LICENSE)

---

## Wie funktioniert RSS-BOOK? (Deutsch)

1. RSS- oder Atom-Feed-URLs in den Einstellungen hinzufügen
2. RSS-BOOK erstellt pro Feed einen Lesezeichen-Ordner unter "RSS"
3. Neue Einträge werden automatisch als Lesezeichen gespeichert
4. Alte Einträge werden nach der eingestellten Aufbewahrungsfrist entfernt

Deine Feeds leben in deinen Lesezeichen — überall verfügbar wo dein Browser synchronisiert, ohne separate App.

### Installation

1. Repository herunterladen oder klonen
2. `chrome://extensions` (oder `edge://extensions`) öffnen
3. **Entwicklermodus** aktivieren
4. **Entpackte Erweiterung laden** → RSS-BOOK-Ordner auswählen

---

*Part of the [file-bricks](https://github.com/file-bricks) ecosystem.*
