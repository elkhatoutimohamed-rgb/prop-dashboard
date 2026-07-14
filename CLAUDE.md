# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal trading dashboard ("Prop Dashboard by Flenkenz") shipped two ways from **one file**:
- as a Windows desktop app via Electron (`main.js` + `index.html`)
- as a PWA hosted on GitHub Pages at https://elkhatoutimohamed-rgb.github.io/prop-dashboard/ (same `index.html`, plus `manifest.json` + `icons/`)

`index.html` is the entire application: inline `<style>` and a single inline `<script>` at the bottom containing all logic. There is no bundler, no build step, no framework, no test suite — it's plain HTML/CSS/JS edited directly. Keep it that way; don't introduce a build pipeline unless asked.

## Commands

- `npm start` — launch the Electron desktop app for local testing (loads `index.html` via `file://`)
- `npm run dist` — build the Windows installer/portable exe via electron-builder into `dist/`
- No lint or test scripts exist.

### Environment quirks (both reproducible when running Claude Code inside VS Code)

- **`git push` hangs when run via the Bash tool** — its credential helper isn't reachable from that shell in this setup. Run `git push` via PowerShell instead; it works there.
- **`npm start` can crash with `Cannot read properties of undefined (reading 'setAppUserModelId')`** if `ELECTRON_RUN_AS_NODE=1` is set in the shell (it leaks in from VS Code's own Electron-based process tree sometimes). Fix: `unset ELECTRON_RUN_AS_NODE` before running `npm start` in Bash, or launch a fresh terminal.
- To catch renderer-side JS errors (not just main-process crashes), main.js forwards `console-message` events (level ≥ warning) from the renderer to the terminal — watch that output after `npm start`, since a broken renderer script otherwise fails silently in the window.

## Deployment model

Both surfaces are driven by the same `master` branch:
- **Electron**: built on demand via `npm run dist`; nothing auto-deploys.
- **PWA**: GitHub Pages serves directly from `master` (root). Any push to `master` triggers a rebuild, live in roughly 1-3 minutes. There's no staging step — pushing to `master` **is** shipping to the PWA.

## Architecture notes that span multiple files

**FF feed has no CORS headers**, so `fetch(FEED_URL)` succeeds from Electron's `file://` origin (lenient) but is silently blocked by real browsers on the `https://` GitHub Pages origin. Workaround, in two parts:
- `.github/workflows/update-feed.yml` runs on a ~20 min cron, fetches the feed server-side (no browser CORS involved) and commits the result to `feed-cache.json` at the repo root — a same-origin fallback the PWA can actually read.
- `loadFeed()` in `index.html` tries, in order: direct `FEED_URL` fetch → same-origin `feed-cache.json` → hardcoded `FALLBACK_EVENTS` constant. The feed-status pill in the header reflects which tier succeeded (Live / Update / Cache / Fallback).

**Myfxbook cannot be fetched or scraped.** Both `myfxbook.com` and its widget subdomain return 403 to non-browser requests — there's no API, and this has been treated as a hard boundary (not something to route around via a hidden browser or similar), not just an inconvenience. Consequently Myfxbook is only usable in the UI as its official embeddable `<iframe>` widget, and the app has no way to programmatically know what Myfxbook shows. Two user-driven mechanisms bridge this gap, both are pure localStorage state merged into the shared `events` array so the rest of the UI (countdown, list) doesn't need to know the difference from FF-sourced events:
- **Override** (`toggleOverride`/`overrides`, key `wr:overrides`): promote an existing FF event's impact to High when Myfxbook rates it red but FF only shows orange.
- **Manual event** (`addManualEvent`/`manualEvents`, key `wr:manual`): add a whole new event by hand (currency, title, exact time) when Myfxbook shows something FF doesn't have at all, or at a different time. Entries auto-expire 24h after their timestamp.

**Payout Junction blocks iframe embedding** via `X-Frame-Options`. `main.js` strips that header (and any `frame-ancestors` CSP directive) globally for the Electron session so the PJ iframe can be embedded — this only happens in the desktop app. The renderer detects Electron via `navigator.userAgent` matching `/\bElectron\//` and only injects the live iframe in that case; the browser/PWA build just shows an "open in window" button instead.

**No alarm/notification system.** An earlier version had a full "arm an event, countdown, checklist, sound alerts" workflow; it was deliberately removed. The app is now a passive at-a-glance dashboard — don't reintroduce sound/notification/countdown-to-action features without being asked.

**Persistence**: a small `store` wrapper around `localStorage` (with an in-memory fallback if `localStorage` throws) is used everywhere state needs to survive reloads; keys are prefixed `wr:`.
