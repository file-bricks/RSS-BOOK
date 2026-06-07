# Firefox AMO Feasibility — RSS-BOOK

Erstellungsdatum: 2026-06-07
Geprüft gegen: MDN Web Docs WebExtensions, Firefox Extension Workshop
Analysierter Stand: RSS-BOOK v1.1.2, manifest.json v1.1.2+gecko

---

## Kurzurteil

**AMO-Upload möglich. Laufzeit-Funktionalität erfordert erhebliche Anpassung.**

Die Extension kann mit den unten dokumentierten Manifest-Ergänzungen bei AMO eingereicht werden.
Sie wird in Firefox aber nicht funktionieren, da zwei zentrale Architektur-Entscheidungen
direkt inkompatibel mit Firefox sind: das Background-Service-Worker-Modell und der
`await chrome.*`-Aufruf-Stil.

---

## Manifest-Kompatibilitätsmatrix

| Feld | Wert | Firefox-Status | Anmerkung |
|---|---|---|---|
| `manifest_version` | 3 | ✅ ab Firefox 109 | Unterstützt |
| `background.service_worker` | `"sw.js"` | ❌ nicht unterstützt | Firefox ignoriert das Feld (Bug 1573659); Background-Script läuft nicht |
| `background.type` | `"module"` | ⚠️ irrelevant | Weil service_worker ignoriert wird |
| `browser_specific_settings.gecko.id` | `"rss-book@file-bricks"` | ✅ Pflicht für AMO | Hinzugefügt in v1.1.2+gecko |
| `browser_specific_settings.gecko.strict_min_version` | `"128.0"` | ✅ Pflicht für AMO | Hinzugefügt in v1.1.2+gecko |
| `permissions: bookmarks` | — | ✅ | Firefox unterstützt die Bookmarks-API |
| `permissions: storage` | — | ✅ | Unterstützt |
| `permissions: alarms` | — | ✅ | Unterstützt |
| `permissions: notifications` | — | ✅ | Unterstützt |
| `permissions: activeTab` | — | ✅ | Unterstützt |
| `permissions: scripting` | — | ✅ | Unterstützt |
| `host_permissions: <all_urls>` | — | ✅ | Unterstützt |
| `options_page` | — | ✅ | Unterstützt |
| `action.default_popup` | — | ✅ | Unterstützt |
| `default_locale` | `"en"` | ✅ | i18n-API unterstützt |

---

## API-Kompatibilitätsmatrix

| API-Aufruf in sw.js / ui/ | Firefox-Status | Details |
|---|---|---|
| `await chrome.storage.local.get()` | ❌ gibt `undefined` zurück | Firefox `chrome.*` ist Callback-basiert, nicht Promise-basiert. Nur `browser.*` gibt Promises zurück. |
| `await chrome.storage.local.set()` | ❌ gibt `undefined` zurück | Gleiche Ursache |
| `await chrome.alarms.get()` | ❌ gibt `undefined` zurück | Gleiche Ursache |
| `chrome.runtime.onInstalled.addListener()` | ✅ | Listener-API funktioniert in Firefox auch mit `chrome.*` |
| `chrome.alarms.onAlarm.addListener()` | ✅ | Listener-API funktioniert |
| `await chrome.bookmarks.*` | ❌ gibt `undefined` zurück | Gleiche Ursache wie storage |
| `showDirectoryPicker()` | ❌ nicht verfügbar | File System Access API nicht implementiert in Firefox |
| `chrome.i18n.getMessage()` | ✅ | Synchron, Callback-frei, funktioniert |
| `chrome.notifications.create()` | ✅ | Callback-basiert, kein await nötig |
| `chrome.scripting.executeScript()` | ⚠️ prüfen | API vorhanden, aber Verhalten in MV3 auf Firefox verifizieren |

---

## Hauptblocker im Detail

### Blocker 1: background.service_worker (Kritisch)

Firefox unterstützt `background.service_worker` nicht (Stand: Firefox 128, Bug 1573659).
Firefox ignoriert das Feld vollständig. Das bedeutet: der gesamte Background-Code
(Alarms, Feed-Polling, Bookmark-Verwaltung) läuft in Firefox nicht.

**Fix für Firefox:** `background.scripts: ["sw.js"]` im Manifest ergänzen.
Firefox würde sw.js dann als Event-Page laden, nicht als Service Worker.
Die MV3-Semantik (kein persistenter Background) wäre ähnlich, aber nicht identisch.

**Problem dabei:** sw.js verwendet ES-Module-Syntax (import/export).
Firefox 121+ unterstützt ES-Module in Event-Pages nicht direkt;
dazu wäre ein Build-Schritt (esbuild/rollup) oder Umstrukturierung nötig.

### Blocker 2: chrome.* Promise-Stil (Kritisch)

Firefox unterscheidet die `chrome`- und `browser`-Namespaces:
- `browser.*` → gibt Promises zurück (Firefox-nativ)
- `chrome.*` → Callback-basiert (Chrome-Kompatibilitäts-Shim)

RSS-BOOK verwendet durchgängig `await chrome.storage.local.get()`,
`await chrome.alarms.get()` usw. Diese Aufrufe liefern in Firefox `undefined`.
Das bedeutet: Storage-Reads, Alarm-Checks und Bookmark-Operationen schlagen stumm fehl.

**Fix:** Alle `chrome.*`-Aufrufe durch `browser.*`-Aufrufe ersetzen,
ODER das Mozilla-WebExtension-Polyfill einbinden (github.com/mozilla/webextension-polyfill).

### Blocker 3: showDirectoryPicker() (Mittelschwer)

`showDirectoryPicker()` (File System Access API) ist in Firefox nicht implementiert.
Der Ordner-Export (`.url`-Dateien) ist damit in Firefox nicht nutzbar.

**Fix:** Datei-Download-Fallback via Blob + `<a download>` als Alternative anbieten.

---

## Gesamtaufwand für vollständige Firefox-Kompatibilität

| Änderung | Aufwand | Priorität |
|---|---|---|
| `background.scripts` als Firefox-Fallback ergänzen | Mittel | P1 |
| sw.js per esbuild bündeln (für Firefox Event-Page) | Mittel | P1 |
| Alle `await chrome.*` → `await browser.*` migrieren ODER Polyfill einbinden | Hoch | P1 |
| `showDirectoryPicker()` → Download-Fallback | Niedrig | P2 |
| Funktionaler Firefox-Laufzeit-Test (echte Browser-Session) | Mittel | P1 |

Geschätzter Gesamtaufwand: **2–3 Arbeitstage** für vollständige Firefox-Kompatibilität.

---

## Nächste Schritte (wenn Firefox AMO verfolgt wird)

1. Mozilla-Polyfill als Dev-Dependency einbinden:
   `npm install --save-dev webextension-polyfill`
2. sw.js und alle `chrome.*`-Aufrufe auf Polyfill-Namespace migrieren.
3. Build-Step (esbuild) für Firefox-Bundle mit `scripts`-Hintergrund einrichten.
4. `manifest.json` mit `background.scripts: ["sw-firefox.js"]` für Firefox erweitern.
5. Funktionaler Laufzeit-Test im echten Firefox-Browser.
6. AMO-Einreichung erst nach Laufzeit-Verifikation.

---

## Hinweis zu den Compat-Tests

`tests/firefox-compat.test.mjs` prüft ausschließlich statische Manifest-Eigenschaften:
- AMO-Pflichtfelder (`browser_specific_settings.gecko.id`, `strict_min_version`)
- MV3-Manifest-Integrität (`service_worker`, kein veraltetes `scripts`-Array)

Diese Tests beweisen AMO-Upload-Eligibilität, nicht Laufzeit-Funktionalität.
Ein Laufzeit-Compat-Test erfordert echte Firefox-Extension-APIs.

---

Quellen:
- MDN Chrome incompatibilities: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities
- MDN background manifest: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- Firefox Bug 1573659: https://bugzilla.mozilla.org/show_bug.cgi?id=1573659
- Mozilla WebExtension Polyfill: https://github.com/mozilla/webextension-polyfill
