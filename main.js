"use strict";
/* ============================================================
   Prop Dashboard by Mohamed aka Flenkenz — Electron Main Process (v1.1)
   - Lädt index.html als Desktop-App (randlos wie App-Modus)
   - Strg+Alt+T: Always-on-top an/aus (📌 in der Titelleiste)
   - backgroundThrottling AUS → Alarme feuern sekundengenau,
     auch wenn das Fenster minimiert/verdeckt ist
   - X-Frame-Options / CSP frame-ancestors werden entfernt
     → Payoutjunction ist einbettbar (index.html erkennt die
       App per User-Agent und blendet das iframe ein)
   - window.open (FF / Myfxbook / PJ) → echte Kind-Fenster
============================================================ */

const { app, BrowserWindow, session, shell, Menu } = require("electron");
const path = require("path");

const CHILD_HOSTS = /^https:\/\/(www\.)?(forexfactory\.com|myfxbook\.com|payoutjunction\.com)\//i;

let win = null;
let pinned = false;

function setTitle() {
  if (win) win.setTitle((pinned ? "📌 " : "") + "Prop Dashboard by Mohamed aka Flenkenz");
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#08080D",
    autoHideMenuBar: true,
    title: "Prop Dashboard by Mohamed aka Flenkenz",
    webPreferences: {
      backgroundThrottling: false, // Alarme laufen auch im Hintergrund exakt
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));

  // Renderer-Konsole (inkl. JS-Fehler) im Terminal sichtbar machen, hilfreich beim Entwickeln
  win.webContents.on("console-message", (e, level, message, line, sourceId) => {
    if (level >= 2) console.log("[renderer]", message, "(" + sourceId + ":" + line + ")");
  });

  // FF-Fenster / Myfxbook-Fenster / PJ-Fenster als Kind-Fenster,
  // alles andere (FAQ-Links etc.) im Standard-Browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (CHILD_HOSTS.test(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1180,
          height: 920,
          autoHideMenuBar: true,
          backgroundColor: "#FFFFFF",
          webPreferences: { contextIsolation: true, nodeIntegration: false }
        }
      };
    }
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Strg+Alt+T → Always-on-top (wenn die App fokussiert ist)
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.control && input.alt && input.key.toLowerCase() === "t") {
      pinned = !pinned;
      win.setAlwaysOnTop(pinned, "floating");
      setTitle();
      e.preventDefault();
    }
  });

  // index.html darf den 📌-Titel nicht überschreiben
  win.on("page-title-updated", (e) => e.preventDefault());
  win.on("closed", () => { win = null; });
  setTitle();
}

app.setAppUserModelId("com.flenkenz.prop-dashboard"); // Windows-Benachrichtigungen

app.whenReady().then(() => {
  // X-Frame-Options + CSP frame-ancestors global entfernen (für das PJ-Embed).
  // Restliche CSP bleibt intakt.
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    const h = details.responseHeaders || {};
    for (const k of Object.keys(h)) {
      const lk = k.toLowerCase();
      if (lk === "x-frame-options") {
        delete h[k];
      } else if (lk === "content-security-policy" || lk === "content-security-policy-report-only") {
        h[k] = h[k].map(v =>
          v.split(";").filter(d => !/^\s*frame-ancestors/i.test(d)).join(";")
        );
      }
    }
    cb({ responseHeaders: h });
  });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { app.quit(); });
