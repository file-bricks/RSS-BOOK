# Beitragsrichtlinie / Contributing Guide

## Deutsch

Danke für Ihr Interesse an RSS-BOOK.

### Wie Sie beitragen können

1. **Bug melden:** Öffnen Sie ein GitHub Issue mit Reproduktionsschritten.
2. **Feature vorschlagen:** Beschreiben Sie Nutzen, Zielgruppe und erwartetes Verhalten.
3. **Code beitragen:** Erstellen Sie einen Pull Request gegen `main`.

### Lokale Entwicklung

RSS-BOOK ist eine Manifest-V3-Browser-Erweiterung ohne Build-Schritt.

1. Repository klonen
2. `edge://extensions/` oder `chrome://extensions/` öffnen
3. Entwicklermodus aktivieren
4. Diesen Ordner als entpackte Erweiterung laden
5. Änderung testen, Extension neu laden, Verhalten im Pull Request beschreiben

### Pull Requests

- Kleine, klar abgegrenzte Änderungen bevorzugen
- Keine API-Keys, Tokens, lokalen Testdaten oder privaten Feedlisten committen
- UI-Texte in `_locales/en/messages.json` und `_locales/de/messages.json` pflegen
- Änderungen an Permissions, Host-Zugriffen oder Netzwerkverhalten in `README.md` und `PRIVACY_POLICY.md` dokumentieren

### Lizenz

Beiträge werden unter der MIT-Lizenz dieses Projekts eingereicht, sofern im Pull Request nichts anderes ausdrücklich vereinbart wird.

---

## English

Thank you for your interest in RSS-BOOK.

### How to Contribute

1. **Report bugs:** Open a GitHub issue with reproduction steps.
2. **Suggest features:** Describe the benefit, target user, and expected behavior.
3. **Contribute code:** Open a pull request against `main`.

### Local Development

RSS-BOOK is a Manifest V3 browser extension with no build step.

1. Clone the repository
2. Open `edge://extensions/` or `chrome://extensions/`
3. Enable developer mode
4. Load this folder as an unpacked extension
5. Test the change, reload the extension, and describe the behavior in the pull request

### Pull Requests

- Prefer small, focused changes
- Do not commit API keys, tokens, local test data, or private feed lists
- Keep UI strings aligned in `_locales/en/messages.json` and `_locales/de/messages.json`
- Document permission, host access, or network behavior changes in `README.md` and `PRIVACY_POLICY.md`

### License

Contributions are submitted under this project's MIT license unless explicitly agreed otherwise in the pull request.
