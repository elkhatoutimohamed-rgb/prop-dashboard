# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal trading dashboard ("Prop Dashboard by Flenkenz") shipped two ways from **one file**:
- as a PWA hosted on GitHub Pages at https://elkhatoutimohamed-rgb.github.io/prop-dashboard/ (same `index.html`, plus `manifest.json` + `icons/`) — **this is the only surface actually in use** (browser on PC, Safari bookmark on the user's phone)
- as a Windows desktop app via Electron (`main.js` + `index.html`) — **frozen as of 2026-07-31**: the user confirmed they don't plan to use the desktop app anymore. It stays in the repo and working, but don't invest effort in it (no feature work, no proactive Electron upgrades, no desktop-specific testing) unless the user explicitly asks. Electron-only concerns (header stripping, child windows, always-on-top) matter only if this ever gets revived.

`index.html` is the entire application: inline `<style>` and a single inline `<script>` at the bottom containing all logic. There is no bundler, no build step, no framework, no test suite — it's plain HTML/CSS/JS edited directly. Keep it that way; don't introduce a build pipeline unless asked.

## Commands

- `npm start` — launch the Electron desktop app for local testing (loads `index.html` via `file://`)
- `npm run dist` — build the Windows installer/portable exe via electron-builder into `dist/`
- No lint or test scripts exist.

### Environment quirks (both reproducible when running Claude Code inside VS Code)

- **`git push` hangs when run via the Bash tool** — its credential helper isn't reachable from that shell in this setup. Run `git push` via PowerShell instead; it works there.
- **`npm start` can crash with `Cannot read properties of undefined (reading 'setAppUserModelId')`** if `ELECTRON_RUN_AS_NODE=1` is set in the shell (it leaks in from VS Code's own Electron-based process tree sometimes). Fix: `unset ELECTRON_RUN_AS_NODE` before running `npm start` in Bash, or launch a fresh terminal.
- To catch renderer-side JS errors (not just main-process crashes), main.js forwards `console-message` events (level ≥ warning) from the renderer to the terminal — watch that output after `npm start`, since a broken renderer script otherwise fails silently in the window.

## Dependency / `npm audit` status (updated 2026-07-31)

**Electron was upgraded 35.7.5 → 43.2.0 and electron-builder 25 → 26.15.3 on 2026-07-31.** Verified: `npm start` clean, PJ iframe + Myfxbook widget + feed pill confirmed working by the user in the running app, `npm run dist` builds the portable exe successfully.

- All Electron security advisories are resolved. What `npm audit` still reports (~16 high) is **exclusively electron-builder's transitive build-time deps** (`@electron/asar`/`ejs`/`jake`/`glob`/`minimatch` chain) with no upstream fix released yet. Build tooling only — never reaches a user; the PWA ships no npm code at all. Don't chase these — and since the desktop app is frozen (see top), don't proactively bump Electron anymore either.
- The only code change the 35→43 jump required: the `console-message` handler in `main.js` (Electron 32+ passes an event object; `level` is now a string). The header-stripping (`onHeadersReceived`), `setWindowOpenHandler`, and user-agent Electron detection all survived unchanged.
- Since Electron 42, the binary downloads **on first run** instead of at `npm install` — a fresh clone's first `npm start` needs network and takes a moment longer. Not a bug.

## Deployment model

Both surfaces are driven by the same `master` branch:
- **Electron**: built on demand via `npm run dist`; nothing auto-deploys.
- **PWA**: GitHub Pages serves directly from `master` (root). Any push to `master` triggers a rebuild, live in roughly 1-3 minutes. There's no staging step — pushing to `master` **is** shipping to the PWA.

## Working conventions

- **Always commit and push to `master` right after making a requested change** — don't leave edits sitting locally uncommitted. Per the deployment model above, pushing to `master` *is* shipping to the live PWA, and that's the only environment the user (and the friends he shares this with) actually cares about. Skip local-browser verification loops (cache-busting, incognito windows, hard refreshes) unless explicitly asked — that time is better spent shipping and letting the user check the real live site.
- **Git identity**: this repo's commits are authored as `Flenkenz <elkhatoutimohamed@gmail.com>`. If a fresh clone has no local git identity configured and a commit fails with "Author identity unknown", set it locally (not `--global`) to match: `git config --local user.name "Flenkenz"` and `git config --local user.email "elkhatoutimohamed@gmail.com"`.
- **`git push` should be run via PowerShell**, not the Bash tool, per the environment quirk below.

## Prop-firm rule data — sourcing rule

The Regel-Radar table and News-Regel-Matrix cards in `index.html` state real trading rules (drawdown %, consistency rules, news-trading windows, payout requirements, weekend-holding policy, risk limits) for FTMO, The5ers, Alpha Capital, FundingPips and FundedNext. **These numbers get used to manage real funded-account risk — getting them wrong has real-money consequences.**

When researching or verifying any of this data: **use only each firm's own official FAQ/help-center pages** — e.g. `ftmo.com/en/faq/...`, `help.the5ers.com/...`, `help.alphacapitalgroup.uk/...`, `help.fundingpips.com/...`, `help.fundednext.com/...`. Never rely on third-party blogs, "review" sites, or aggregator content (propvator.com, tradingfinder.com, proptradingvibes.com, tradetanto.com, etc.) — not even as a stepping stone before confirming with the primary source. Prefer fetching the official URL directly over summarizing search results, since search summaries often blend in third-party content or conflate different account variants (e.g. Stellar Instant vs. Stellar 2-Step) without flagging it. If an official page is blocked or unreachable, say so explicitly rather than silently falling back to a secondary source. If the user states something from their own funded-account experience that conflicts with a written source, trust the user.

## Architecture notes that span multiple files

**FF feed has no CORS headers**, so `fetch(FEED_URL)` succeeds from Electron's `file://` origin (lenient) but is silently blocked by real browsers on the `https://` GitHub Pages origin. Workaround, in two parts:
- `.github/workflows/update-feed.yml` runs on a ~30 min cron (matching `AUTO_REFRESH_MS` in the client — polling faster is pointless since the app only re-reads the cache every 30 min, and the feed itself only changes a few times a day), fetches server-side (no browser CORS involved) and commits the result to `feed-cache.json` at the repo root — a same-origin file the PWA can actually read. The job runs under a `concurrency` group with a 5 min timeout and retries its push with `--rebase`, so overlapping runs can't race each other onto `master`.
- `loadFeed()` in `index.html` fetches `FEED_URL` and `feed-cache.json` **in parallel and merges them** (dedupe key `ts|country|title`, live wins — it gets `actual`/`revision` first). Falls back to the hardcoded `FALLBACK_EVENTS` constant only if both fail. The feed-status pill reflects which tier succeeded (Live / Update / Cache / Fallback). Note "Live" only means the direct fetch worked, not that the horizon came from it.

**The calendar covers two weeks, and only the cache can deliver that.** `ff_calendar_thisweek.json` is the *only* feed faireconomy still serves — `nextweek`/`lastweek`/`today` all 404 in every format (json/xml/csv), and it rolls over on Sunday. That meant next week's events only appeared on Sunday, which was the actual complaint. So the workflow now builds `feed-cache.json` from three sources via `.github/scripts/build-feed-cache.js`:
- the official `thisweek` JSON feed (authoritative for its own window — only source with actual values),
- next week, scraped from `forexfactory.com/calendar?week=next`, whose HTML embeds the events as `window.calendarComponentStates[N] = { days: [...] }`. The object literal has unquoted keys so `JSON.parse` can't read it whole; the script bracket-matches the `days:` array out (string-aware) and maps `dateline`/`currency`/`name`/`impactName` onto the official feed's shape,
- the previous `feed-cache.json`, so a failed scrape doesn't collapse the horizon.

Rules that matter if you touch this: the official feed wins inside its own time range (cache and scrape only contribute events *after* its last one — this is also what prevents duplicate rows if FF words a title differently on the page than in the feed); everything before the official feed's first event is pruned; and the output must stay **deterministic** — no timestamp goes in the file, or the 30-min cron would commit and rebuild Pages every single run. A failing scrape is explicitly non-fatal (`::warning::`, degrades to the old one-week behaviour). If FF ever blocks the runner IP, that's the tier that dies first — check the workflow log for "Folgewoche nicht abrufbar".

**Myfxbook cannot be fetched or scraped.** Both `myfxbook.com` and its widget subdomain return 403 to non-browser requests — there's no API, and this has been treated as a hard boundary (not something to route around via a hidden browser or similar), not just an inconvenience. Consequently Myfxbook is only usable in the UI as its official embeddable `<iframe>` widget, and the app has no way to programmatically know what Myfxbook shows. Two user-driven mechanisms bridge this gap, both are pure localStorage state merged into the shared `events` array so the rest of the UI (countdown, list) doesn't need to know the difference from FF-sourced events:
- **Override** (`toggleOverride`/`overrides`, key `wr:overrides`): promote an existing FF event's impact to High when Myfxbook rates it red but FF only shows orange.
- **Manual event** (`addManualEvent`/`manualEvents`, key `wr:manual`): add a whole new event by hand (currency, title, exact time) when Myfxbook shows something FF doesn't have at all, or at a different time. Entries auto-expire 24h after their timestamp.

**Payout Junction blocks iframe embedding** via `X-Frame-Options`. `main.js` strips that header (and any `frame-ancestors` CSP directive) globally for the Electron session so the PJ iframe can be embedded — this only happens in the desktop app. The renderer detects Electron via `navigator.userAgent` matching `/\bElectron\//` and only injects the live iframe in that case; the browser/PWA build just shows an "open in window" button instead.

**No alarm/notification system.** An earlier version had a full "arm an event, countdown, checklist, sound alerts" workflow; it was deliberately removed. The app is now a passive at-a-glance dashboard — don't reintroduce sound/notification/countdown-to-action features without being asked.

**Persistence**: a small `store` wrapper around `localStorage` (with an in-memory fallback if `localStorage` throws) is used everywhere state needs to survive reloads; keys are prefixed `wr:`.
