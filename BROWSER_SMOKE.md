# RSS-BOOK Browser-Smoke

Status: Dokumentierter manueller Smoke-Plan. In diesem Lauf wurden keine echten Browser-Smokes ausgeführt.

Zweck: Vor Edge-Add-ons-Einreichung und nach größeren Manifest-, Service-Worker-, Options- oder Packaging-Änderungen dieselben Kernpfade in Edge, Chrome, Brave und Vivaldi prüfen.

## Voraussetzungen

- Frischer Projektstand aus diesem Ordner.
- `npm test` ist grün.
- Optional vor Edge-Upload: `npm run edge-preflight` ist grün und erzeugt `dist/EDGE_ADDONS_PREFLIGHT.md`.
- Testprofil ohne produktive Lesezeichen oder ein temporäres Browserprofil.

## Installationspfad

| Browser | Adresse | Installationsart |
|---|---|---|
| Edge | `edge://extensions` | Entwicklermodus, `Entpackte Erweiterung laden` |
| Chrome | `chrome://extensions` | Entwicklermodus, `Entpackte Erweiterung laden` |
| Brave | `brave://extensions` | Entwicklermodus, `Entpackte Erweiterung laden` |
| Vivaldi | `vivaldi://extensions` | Entwicklermodus, `Entpackte Erweiterung laden` |

Als Ordner immer den Projektordner `RSS-BOOK` wählen, nicht `dist/` und nicht ein ZIP-Archiv.

## Smoke-Matrix

| Schritt | Erwartung |
|---|---|
| Erweiterung laden | Manifest V3 lädt ohne Fehler; Icon ist sichtbar. |
| Optionen öffnen | Optionsseite öffnet ohne Konsolenfehler. |
| Feed hinzufügen | Eine gültige RSS- oder Atom-URL wird gespeichert und in der Liste angezeigt. |
| Manuelles Update starten | Popup oder Optionsseite stößt einen Update-Lauf an; Status/Fehler sind sichtbar. |
| Lesezeichen prüfen | Unter dem Root-Ordner `RSS` entstehen Feed-Ordner und Einträge. |
| OPML exportieren | OPML-Datei wird heruntergeladen und enthält die eingerichteten Feeds. |
| OPML importieren | Exportierte OPML-Datei lässt sich in ein frisches Testprofil wieder importieren. |
| Ordner-Export testen | `.url`-Export schreibt Dateien mit bereinigten Dateinamen. |
| Retention prüfen | Niedrige Aufbewahrungsfrist entfernt alte Einträge beim nächsten Lauf. |
| Discover feeds | Auf einer Testseite mit RSS-Link werden Feeds nach Nutzerklick erkannt. |
| Dark Mode | Helles und dunkles Theme bleiben lesbar. |
| Neustart | Nach Browser-Neustart bleiben Feeds, Root-Ordner-ID und letzter Worker-Status erhalten. |

## Live-Feed-Beispiele

Für echte Browser-Smokes nur öffentliche, unkritische Feeds verwenden. Keine privaten Intranet-, Mail-, Kalender- oder Account-Feeds eintragen.

| Typ | Beispiel |
|---|---|
| RSS 2.0 | `https://www.nasa.gov/news-release/feed/` |
| Atom | `https://github.blog/feed/` |
| Podcast RSS | `https://feeds.simplecast.com/54nAGcIl` |

Wenn ein Live-Feed temporär nicht erreichbar ist, ist das kein App-Fehler. Ergebnis als Netzwerk-/Feed-Blocker notieren und mit einem zweiten Feed gegenprüfen.

## Ergebnisnotiz

Nach einem echten Durchlauf pro Browser ein kurzes Ergebnis in `AUFGABEN.txt` oder `CHECKS-LOG.txt` ergänzen:

```text
YYYY-MM-DD Browser-Smoke: Edge PASS, Chrome PASS, Brave PASS, Vivaldi PASS.
Blocker: keine.
```

Bis ein echter Lauf dokumentiert ist, bleiben die Aufgaben `Edge testen` und `Chrome/Brave testen` offen.
