# RSS-BOOK

[English](README.md) | [Deutsch](README_de.md)

Bookmark-based RSS reader browser extension for Chrome, Edge, Brave and Vivaldi.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)
![Privacy](https://img.shields.io/badge/Privacy-No%20Tracking-brightgreen)
![Ecosystem: file-bricks](https://img.shields.io/badge/Ecosystem-file--bricks-4F46E5)
![Umbrella: open-bricks](https://img.shields.io/badge/Umbrella-open--bricks-0EA5E9)
![CI](https://github.com/file-bricks/RSS-BOOK/actions/workflows/ci.yml/badge.svg)
![Tests](https://img.shields.io/badge/Tests-62%20passed-brightgreen)

RSS-BOOK is a privacy-first RSS and Atom feed reader for Chromium browsers.
Instead of creating another account or cloud database, it saves feed entries as
browser bookmarks so Chrome, Edge, Brave and Vivaldi sync can carry them across
devices. It is built for readers who want a lightweight Chrome Web Store RSS
extension with OPML import/export, feed discovery, notifications, dark mode and
no tracking.

![RSS-BOOK](assets/social-preview.png)

> [!NOTE]
> For AI coding agents and LLM automation tools: See [`llms.txt`](llms.txt) for project architecture context, key entry points, search phrases, and test instructions.

## System Architecture

```mermaid
graph TD
    A["Chromium Browser (Chrome / Edge / Brave / Vivaldi)"] --> B["Service Worker (sw.js)"]
    B -->|Scheduled Alarm / Startup| C["RSS & Atom Parser (lib/rss.js)"]
    C -->|ETag & 304 Caching| D["Remote RSS / Atom Feed Sources"]
    C -->|Parsed Feed Entries| E["Bookmark Engine (lib/bookmarks.js)"]
    E -->|Browser Bookmarks API| F["Local 'RSS' Bookmark Folders"]
    F -->|Native Sync| G["Chromium Cross-Device Sync"]
    
    H["Extension UI (ui/popup.html & ui/options.html)"] -->|User Action / Discovery| B
    H -->|OPML Import / Export & .url Export| E
```



## Get RSS-BOOK

- **Chrome Web Store:** [Install RSS-BOOK](https://chromewebstore.google.com/detail/rss-book/aednfjhookicnhcjhjifbaepglinbdli)
- **GitHub Releases:** [Download the extension ZIP](https://github.com/file-bricks/RSS-BOOK/releases)
- **Source code:** [file-bricks/RSS-BOOK](https://github.com/file-bricks/RSS-BOOK)

RSS-BOOK is also usable by sideloading the unpacked repository in Chrome, Edge,
Brave or Vivaldi.

## Start here

| Need | Use |
|---|---|
| Install the extension | Chrome Web Store listing |
| Review the code | `sw.js`, `lib/rss.js`, `lib/bookmarks.js`, `ui/options.js` |
| Check privacy behavior | `PRIVACY_POLICY.md` and the permissions table below |
| Build an Edge upload ZIP | `npm run package` |
| Run Edge submission preflight | `npm run edge-preflight` |
| Compare the power-user edition | `RSS-BOOKSTORE` for Native Messaging and folder sync |

## How it works

1. Add RSS or Atom feed URLs in the options page
2. RSS-BOOK creates a bookmark folder per feed under an "RSS" root folder
3. New entries are automatically saved as bookmarks
4. Old entries are cleaned up based on your retention settings

Your feeds live in your bookmarks — accessible everywhere your browser syncs, without a separate app.

```mermaid
graph TD
    UI["Extension UI (popup / options)"] -->|User Actions / OPML| ST["MV3 Storage (lib/storage.js)"]
    SW["Service Worker (sw.js)"] -->|Scheduled Alarms| RS["RSS/Atom Parser (lib/rss.js)"]
    RS -->|Parsed Items| ST
    SW -->|Manage Bookmarks| BM["Bookmarks API (lib/bookmarks.js)"]
    BM -->|Sync Bookmarks| BROWSER["Chromium Bookmarks Sync"]
```

## Features

- **Manifest V3 native** — built for modern Chromium browsers
- **RSS 2.0 + Atom** — both formats supported
- **CDATA-safe parsing** — titles, links, and Atom dates are cleaned before bookmark creation
- **ETag/304 caching** — bandwidth-efficient, respects server cache headers
- **Per-feed intervals** — each feed can have its own update schedule
- **Retention** — auto-remove bookmarks older than N days
- **Notifications** — desktop alerts for new entries
- **Privacy-first** — zero data collection, zero telemetry; network calls are limited to configured feeds and feed discovery you explicitly trigger
- **Unsubscribe preserves bookmarks** — remove a feed, keep the entries

## Install

### Chrome Web Store

Install the published extension from the
[Chrome Web Store](https://chromewebstore.google.com/detail/rss-book/aednfjhookicnhcjhjifbaepglinbdli).

### From GitHub (Chrome, Edge, Brave, Vivaldi)

1. Download or clone this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `RSS-BOOK` folder

### Edge Add-ons package

Create the upload-ready ZIP with `npm run package`. The generated archive stays local under `dist/` and is intentionally ignored by git.
Run `npm run edge-preflight` before upload to rebuild the ZIP, validate the store icon, screenshots, locale-derived listing text and privacy file, and write `dist/EDGE_ADDONS_PREFLIGHT.md`.

## Product Screenshots

![RSS-BOOK popup with subscribed feeds](assets/screenshot-1-popup.png)
![RSS-BOOK options page with feed settings](assets/screenshot-2-options.png)
![RSS-BOOK browser bookmark folders](assets/screenshot-3-folders.png)
![RSS-BOOK saved feed entries as bookmarks](assets/screenshot-4-entries.png)

## Usage

**Popup** — click the extension icon to see your feeds and trigger a manual update.

**Discover feeds** — click *Discover feeds* on a page to look for RSS/Atom links in the current tab and common feed paths on that site's origin.

**Options** — right-click the icon → *Options* (or open from popup) to:
- Add/remove feeds
- Set update intervals (global or per-feed)
- Configure retention (auto-cleanup after N days)
- Toggle notifications
- Import/export OPML and export all feed bookmarks as `.url` files in folders

## Development

RSS-BOOK has no bundling step. The repository includes 62 dependency-free Node tests for parser behavior, a 10-fixture RSS/Atom feed matrix, CDATA cleanup, OPML, storage, bookmark cleanup, feed discovery, folder export, store assets, service-worker scheduling, lifecycle diagnostics, light/dark theme CSS coverage, hashing, Edge package contents, and Edge submission preflight:

```bash
npm test
```

Create the Edge upload ZIP with:

```bash
npm run package
```

The package is written to `dist/RSS-BOOK-v<manifest version>-edge.zip`.
For Microsoft Edge Add-ons submission prep, run:

```bash
npm run edge-preflight
```

This validates the local upload ZIP plus store-facing assets and writes a short
manual-upload checklist under `dist/EDGE_ADDONS_PREFLIGHT.md`.

GitHub Actions runs the same suite on pushes to `main` and pull requests.

## Localization

The default UI is English and the bundled German locale lives in `_locales/de/messages.json`.
German user-facing strings use real Umlaute such as ä, ö, ü, and ß so browser-store text and extension UI stay readable without JSON escape noise.

## Permissions

| Permission | Why |
|---|---|
| `bookmarks` | Create and manage feed bookmark folders |
| `storage` | Store feed config and cache metadata locally |
| `alarms` | Schedule periodic feed updates |
| `notifications` | Alert you about new feed entries |
| `activeTab` | Inspect the current tab only when you click feed discovery |
| `scripting` | Run the feed-discovery scanner in the current tab after your click |
| `<all_urls>` | Fetch configured feeds and probe common feed paths during explicit discovery |

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
├── scripts/             # Release packaging helpers
├── tests/               # Node test suite
└── icons/               # Extension and store icons
```

## What's new in v1.1.2

- [x] OPML import/export
- [x] English UI with German translation (i18n)
- [x] Dark mode (automatic via `prefers-color-scheme`)
- [x] Folder export UI for `.url` files
- [x] Feed autodiscovery (`<link rel="alternate">`, visible feed links, and common feed paths after a user click)
- [x] Per-feed error display (no more silent failures)
- [x] Configurable bookmark folder name
- [x] Bookmark folder survives rename/move (tracked by ID)
- [x] Option to delete bookmarks on unsubscribe

## Discovery keywords

`RSS reader`, `Atom feed reader`, `Chrome RSS extension`, `bookmark-based RSS reader`,
`browser bookmark feed reader`, `Manifest V3 RSS`, `OPML import export`,
`privacy-first RSS reader`, `no-account feed reader`, `Edge RSS extension`,
`RSS bookmarks sync`, `Chrome Web Store RSS reader`, `Chromium feed reader`,
`local-first feed reader`.

## Search and listing context

Use the canonical repo name `file-bricks/RSS-BOOK` when linking this project.
The short product name collides with book-RSS generators, RSS icons, GitBook
feed plugins and generic RSS tutorials, so external listings should describe it
as a **privacy-first Chrome Web Store RSS extension that stores feed entries as
browser bookmarks**.

Best-fit listing categories:

- Chrome Web Store RSS and Atom feed readers
- Manifest V3 browser extensions
- Bookmark-based reading and cross-device browser sync tools
- Privacy-first, no-account feed readers
- Local-first productivity tools for Chrome, Edge, Brave and Vivaldi

## Related Project / Geschwisterprojekt

| Projekt | Distribution | Sync | Native Messaging |
|---|---|---|---|
| **RSS-BOOK** (dieses Projekt) | Chrome Web Store + GitHub | Einweg (Feeds → Lesezeichen) | Nein |
| [RSS-BOOKSTORE](https://github.com/file-bricks/RSS-BOOKSTORE) | GitHub / Sideloading | Bidirektional (Lesezeichen ↔ Ordner) | Ja |

RSS-BOOKSTORE is the power-user edition: it adds a Native Messaging host and
bidirectional sync between browser bookmarks and a local Windows folder.
It requires a manual sideload installation and a Python runtime.

## License

[MIT](LICENSE)

---

## Wie funktioniert RSS-BOOK? (Deutsch)

1. RSS- oder Atom-Feed-URLs in den Einstellungen hinzufügen
2. RSS-BOOK erstellt pro Feed einen Lesezeichen-Ordner unter "RSS"
3. Neue Einträge werden automatisch als Lesezeichen gespeichert
4. Alte Einträge werden nach der eingestellten Aufbewahrungsfrist entfernt

Deine Feeds leben in deinen Lesezeichen — überall verfügbar wo dein Browser synchronisiert, ohne separate App.

Über *Discover feeds* sucht RSS-BOOK auf der aktuellen Seite nach RSS-/Atom-Links und prüft nach deinem Klick typische Feed-Pfade derselben Website.

### Installation

1. Repository herunterladen oder klonen
2. `chrome://extensions` (oder `edge://extensions`) öffnen
3. **Entwicklermodus** aktivieren
4. **Entpackte Erweiterung laden** → RSS-BOOK-Ordner auswählen

---

*Part of the [file-bricks](https://github.com/file-bricks) ecosystem.*

---

## Haftung / Liability

Dieses Projekt ist eine **unentgeltliche Open-Source-Schenkung** im Sinne der §§ 516 ff. BGB. Die Haftung des Urhebers ist gemäß **§ 521 BGB** auf **Vorsatz und grobe Fahrlässigkeit** beschränkt. Ergänzend gilt der Haftungsausschluss der MIT-Lizenz.

Nutzung auf eigenes Risiko. Keine Wartungszusage, keine Verfügbarkeitsgarantie, keine Gewähr für Fehlerfreiheit oder Eignung für einen bestimmten Zweck.

This project is an unpaid open-source donation. Liability is limited to intent and gross negligence (§ 521 German Civil Code). Use at your own risk. No warranty, no maintenance guarantee, no fitness-for-purpose assumed.
