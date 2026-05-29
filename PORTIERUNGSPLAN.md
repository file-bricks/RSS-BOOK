# RSS-BOOK Portierungsplan

Stand: 2026-05-29
Automation: SOFTWARE STRANGE NEW WORLDS
Status: Pfad B, Plan neu erstellt

## Kurzentscheidung

RSS-BOOK ist keine Desktop-App, die auf Windows, macOS, Linux, Android und iOS
geklont werden sollte. Die beste Produktlinie ist eine Browser-Extension für
Chromium-Browser mit Store-Vertrieb über Chrome Web Store und Edge Add-ons.
Firefox AMO ist ein sinnvoller optionaler Browser-Port. Native Desktop-Apps,
native Mobile-Apps und eine Web/PWA-Produktlinie sind aktuell keine passenden
Ziele.

## Features der besten Version

- RSS- und Atom-Feeds verwalten.
- Neue Feed-Einträge als Browser-Lesezeichen speichern.
- Browser-Sync als vorhandene Synchronisationsschicht nutzen.
- OPML importieren und exportieren.
- Feed-Autodiscovery nach Nutzerklick ausführen.
- Per-Feed-Intervalle, Retention und Desktop-Benachrichtigungen konfigurieren.
- Feed-Ordner als `.url`-Dateien exportieren.
- Helle/dunkle Darstellung und deutsche Lokalisierung bereitstellen.
- Service-Worker-Lifecycle über Diagnosewerte sichtbar machen.

## Abgeleitete Usecases

| Feature | Wann braucht man das? | Usecase |
|---|---|---|
| Feeds als Lesezeichen speichern | Nutzer lesen RSS im Browser und wollen keine zusätzliche Reader-Datenbank | Bookmark-basierter RSS-Reader |
| Browser-Sync nutzen | Nutzer wechseln zwischen mehreren Desktop-Browsern oder Geräten desselben Browser-Profils | Browser-Sync statt App-eigener Sync |
| OPML Import/Export | Nutzer migrieren von Feedly, Thunderbird oder anderen Readern | Reader-Wechsel und Backup |
| Feed-Autodiscovery | Nutzer findet auf einer Website schnell den passenden Feed | Feed-Setup direkt beim Surfen |
| Retention und Cleanup | Nutzer will viele Feeds, aber keinen dauerhaft wachsenden Lesezeichenbaum | Automatische Lesezeichen-Hygiene |
| `.url`-Export | Nutzer möchte Feed-Einträge in Ordnern archivieren oder weitergeben | Dateibasierter Einweg-Export |
| Lifecycle-Diagnostik | Nutzer oder Maintainer muss prüfen, ob MV3-Alarme und Service Worker laufen | Browser-spezifische Fehlersuche |

## Usecase-Settings

### Setting 1: Normale Browser-Nutzer

Zielgruppe: Chrome-, Edge-, Brave- und Vivaldi-Nutzer, die RSS im Browser nutzen
und vorhandene Lesezeichen-Synchronisation verwenden möchten.

Plattformstrategie:
- Chrome Web Store bleibt der primäre Kanal.
- Edge Add-ons ist der nächste Store-Kanal.
- Brave und Vivaldi werden über Chrome Web Store und GitHub-Sideloading bedient.
- Die Extension bleibt Manifest V3 und vermeidet Native Messaging.

### Setting 2: Firefox-Nutzer

Zielgruppe: Nutzer, die RSS-BOOK bewusst in Firefox verwenden möchten.

Plattformstrategie:
- Optionaler Port auf Firefox AMO nach Chromium-Stabilisierung.
- Vorher prüfen: Manifest-V3-Kompatibilität, `browser_specific_settings`,
  API-Unterschiede bei Bookmarks, Alarms, Notifications und Host-Permissions.
- Kein paralleles Feature-Forking; Firefox darf nur starten, wenn dieselben
  Kern-Usecases ohne Native-Messaging-Zwang abbildbar bleiben.

### Setting 3: Power-User mit bidirektionalem Dateisystem-Sync

Zielgruppe: Nutzer, die Lesezeichen und lokale Ordner bidirektional synchronisieren
wollen.

Plattformstrategie:
- Nicht RSS-BOOK, sondern separates Schwesterprojekt RSS-BOOKSTORE.
- Native Messaging bleibt bewusst außerhalb von RSS-BOOK, weil es Store-Review,
  Installation und Sicherheitsmodell deutlich verändert.

## Plattformentscheidungen

| Plattform | Entscheidung | Begründung |
|---|---|---|
| Chrome Web Store | Ziel | Größte passende Extension-Reichweite, bereits live |
| Edge Add-ons | Ziel | Gleiche Chromium-Basis, kostenloser zusätzlicher Store-Kanal |
| Brave/Vivaldi | Unterstützt über Chrome/Sideloading | Kein eigener Store nötig |
| Firefox AMO | Optional | Sinnvoller Browser-Port, aber erst nach API-Kompatibilitätsprüfung |
| Windows Desktop-App | Nicht-Ziel | Usecase sitzt im Browser und in dessen Lesezeichen-API |
| macOS Desktop-App | Nicht-Ziel | Kein Mehrwert gegenüber Browser-Extension |
| Linux Desktop-App | Nicht-Ziel | Kein Mehrwert gegenüber Browser-Extension |
| Android App | Nicht-Ziel | Mobile Browser-Extensions und Bookmark-APIs decken den Kernusecase nicht verlässlich ab |
| iOS App | Nicht-Ziel | Safari/iOS-Extension-Modell wäre ein eigenes Produkt mit anderem Sync-Modell |
| Web/PWA | Nicht-Ziel | Eine PWA hätte keinen direkten Zugriff auf Browser-Lesezeichen |

## Synchronisationsentscheidung

RSS-BOOK synchronisiert nicht selbst. Der Kernnutzen ist, vorhandene
Browser-Lesezeichen und deren Browser-Sync zu nutzen. Für Wechsel und Backup
bleiben OPML und `.url`-Export die passenden dateibasierten Wege. Direkte
Server-Synchronisation wäre ein fremder Usecase und gehört nicht in RSS-BOOK.

## Nächste Schritte

1. Edge-Add-ons-Einreichung mit aktuellem `npm run package`-ZIP vorbereiten.
2. Browser-Smoke für Edge, Chrome, Brave und Vivaldi dokumentieren.
3. Live-Feed-Smoke mit mindestens zehn echten RSS-/Atom-Feeds ergänzen.
4. Firefox-AMO-Feasibility als P3 prüfen: Manifest, API-Deltas und Testmatrix.
5. README und Release Plan nach Edge-Einreichung auf den tatsächlichen Store-Status aktualisieren.

## Nicht-Ziele

- Keine native Desktop-App für Windows, macOS oder Linux.
- Keine Android- oder iOS-App.
- Keine PWA als Produktlinie.
- Keine direkte Server-Synchronisation.
- Keine Vermischung mit RSS-BOOKSTORE und dessen Native-Messaging-Usecase.
