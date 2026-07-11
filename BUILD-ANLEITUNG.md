# Prop Dashboard — Windows-App bauen (v1.1)

## Einmalig: Voraussetzung
Node.js LTS installieren: https://nodejs.org (Standard-Installer, alles auf Weiter).
Wenn du das für v1.0 schon gemacht hast: nichts zu tun.

## Bauen (im entpackten Ordner)
Rechtsklick im Ordner → „In Terminal öffnen", dann:

    npm install
    npm run dist

Fertig. Im Unterordner `dist\` liegen dann:

- **Prop-Dashboard-1.1.0-portable.exe** — einfach doppelklicken, keine Installation
- **Prop-Dashboard-Setup-1.1.0.exe** — klassischer Installer mit Desktop-Icon

## Zum schnellen Testen ohne Build
    npm start

## Update von v1.0
Du hast den alten Ordner mit fertigem `node_modules` noch?
Dann reicht: neue `index.html` und `main.js` aus diesem ZIP in den alten
Ordner kopieren (überschreiben) → `npm run dist`. Kein `npm install` nötig.

## Was die App gegenüber dem Browser kann
- **Strg+Alt+T** → Always-on-top an/aus (📌 in der Titelleiste)
- Alarme feuern **sekundengenau**, auch minimiert (Browser drosselt Hintergrund-Tabs)
- **Payoutjunction ist direkt eingebettet** (unter der Link-Karte) — der
  X-Frame-Header wird von der App entfernt. Im normalen Browser bleibt die
  Sektion unverändert (Fenster-Button).
- FF-Fenster / Myfxbook-Fenster / PJ-Fenster öffnen als echte Kind-Fenster,
  FAQ-Links gehen in deinen Standard-Browser

## Neu in v1.1 (Dashboard-Stand 11.07.2026)
- Zeitstrahl umschaltbar **24h / Woche** (FF-Woche So–Sa), vergangene Events
  der ganzen Woche sichtbar, generell deutlicher abgedunkelt statt fast unsichtbar
- Preis-Ticker: statisches Widget mit **Gold, US30, EURUSD, BTCUSD** —
  kein Lauftext mehr (Geschwindigkeit war bei TradingView nicht einstellbar)
- Overflow-Fix in den Regel-Karten („1%-Equity-Puffer" ragte raus)
- PJ-Hinweistexte passen sich an: Browser ↔ App

## Hinweise
- Windows SmartScreen meckert beim ersten Start der .exe (unsigniert):
  „Weitere Informationen" → „Trotzdem ausführen". Normal bei selbstgebauten Apps.
- localStorage (Overrides, Settings, Checklisten) lebt in der App getrennt
  vom Browser — Einstellungen wandern nicht automatisch mit.
- Dashboard später aktualisieren: neue HTML einfach als `index.html` in den
  Ordner legen und `npm run dist` erneut ausführen (`npm start` zum Testen).
