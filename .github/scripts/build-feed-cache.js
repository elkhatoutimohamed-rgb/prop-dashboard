/* Baut feed-cache.json aus mehreren Quellen zusammen.
 *
 * Hintergrund: der offizielle FF-JSON-Feed (ff_calendar_thisweek.json) deckt
 * ausschliesslich die laufende Woche ab und springt erst sonntags um. Dadurch
 * sah man die Events der Folgewoche erst ab Sonntag — genau das soll weg.
 * ForexFactory selbst rendert unter /calendar?week=next die naechste Woche und
 * legt die Daten als JS-Objekt (window.calendarComponentStates) in die Seite,
 * das laesst sich serverseitig auslesen.
 *
 * Strategie (spaetere Quelle gewinnt bei Duplikaten):
 *   1. bereits gecachte Events (haelt den Horizont, falls ein Abruf mal scheitert)
 *   2. gescrapte Folgewoche
 *   3. offizieller JSON-Feed der laufenden Woche  <- hat als einziger die
 *      tatsaechlichen Werte (actual/revision), gewinnt deshalb immer
 *
 * Aufruf:
 *   node build-feed-cache.js <thisweek.json|-> <nextweek.html|-> <alte-cache.json|-> <out.json>
 * "-" heisst: Quelle nicht verfuegbar (Abruf fehlgeschlagen) und wird uebersprungen.
 *
 * Die Ausgabe ist deterministisch (sortiert, gleiche Eingabe -> gleiches Byte-
 * Ergebnis), damit der Workflow nur committet, wenn sich inhaltlich was geaendert
 * hat. Deshalb steht hier bewusst KEIN Zeitstempel in der Datei: der wuerde bei
 * jedem Lauf differieren und alle 30 Min einen Commit + Pages-Rebuild ausloesen.
 */
const fs = require("fs");

function readIfPresent(p) {
  if (!p || p === "-") return null;
  try {
    const s = fs.readFileSync(p, "utf8");
    return s.trim() ? s : null;
  } catch (e) { return null; }
}

function parseJsonArray(text) {
  if (!text) return null;
  try {
    const d = JSON.parse(text);
    return Array.isArray(d) ? d : null;
  } catch (e) { return null; }
}

/* Schneidet das days-Array aus dem JS-Objektliteral der Kalenderseite heraus.
   JSON.parse kann das Objekt selbst nicht lesen (unquoted keys), das days-Array
   ist fuer sich aber valides JSON — deshalb Klammern zaehlen statt Regex. */
function extractDays(html) {
  if (!html) return null;
  const m = html.match(/window\.calendarComponentStates\[\d+\]\s*=\s*\{/);
  if (!m) return null;
  const dstart = html.indexOf("days: [", m.index);
  if (dstart < 0) return null;
  const from = html.indexOf("[", dstart);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(html.slice(from, end)); } catch (e) { return null; }
}

/* Gescrapte Events auf das Format des offiziellen Feeds bringen, damit der
   Client (parseFeedEvent in index.html) keinen Sonderfall braucht. */
function scrapedToFeed(days) {
  const out = [];
  for (const day of days || []) {
    for (const ev of day.events || []) {
      if (!ev || !ev.dateline) continue;
      const impact = String(ev.impactName || "");
      out.push({
        title: String(ev.name || ""),
        country: String(ev.currency || ""),
        date: new Date(ev.dateline * 1000).toISOString(),
        impact: impact ? impact[0].toUpperCase() + impact.slice(1) : "",
        forecast: ev.forecast == null ? "" : String(ev.forecast),
        previous: ev.previous == null ? "" : String(ev.previous)
      });
    }
  }
  return out;
}

const keyOf = e => Date.parse(e.date) + "|" + (e.country || "") + "|" + (e.title || "");

function main() {
  const [thisweekPath, nextweekPath, oldCachePath, outPath] = process.argv.slice(2);

  const official = parseJsonArray(readIfPresent(thisweekPath));
  const cached = parseJsonArray(readIfPresent(oldCachePath)) || [];
  const days = extractDays(readIfPresent(nextweekPath));
  const scraped = days ? scrapedToFeed(days) : null;
  if (scraped && scraped.length) {
    /* Explizit mitloggen: wird die Seite ueber einen Proxy geholt, koennte der
       die Query (?week=next) verschlucken und still die laufende Woche liefern.
       Dann stimmt der Zeitraum hier nicht und unten kaemen 0 Events an. */
    const ts = scraped.map(e => Date.parse(e.date)).filter(t => !Number.isNaN(t));
    console.log(`  Scrape liefert ${scraped.length} Events, ${new Date(Math.min(...ts)).toISOString().slice(0, 10)} .. ${new Date(Math.max(...ts)).toISOString().slice(0, 10)}`);
  }

  if (!official && !scraped && !cached.length) {
    console.error("Keine einzige Quelle verwertbar — breche ab, alter Cache bleibt stehen.");
    process.exit(1);
  }

  const tsOf = e => Date.parse(e && e.date);
  const officialTs = (official || []).map(tsOf).filter(t => !Number.isNaN(t));
  const hasOfficial = officialTs.length > 0;

  /* Alles vor der laufenden Woche wegwerfen. Referenz ist der offizielle Feed:
     er definiert, wo die aktuelle Woche anfaengt (inkl. bereits gelaufener Tage,
     die die UI ausgegraut weiter anzeigt). Ohne offiziellen Feed: 2 Tage Puffer. */
  const cutoff = hasOfficial ? Math.min(...officialTs) : Date.now() - 2 * 24 * 3600 * 1000;

  /* Innerhalb seines eigenen Zeitfensters ist der offizielle Feed die alleinige
     Wahrheit — er hat als einziger die tatsaechlichen Werte. Bestand und Scrape
     steuern deshalb nur bei, was NACH diesem Fenster liegt. Das verhindert auch
     Doppeleintraege, falls FF eine Veranstaltung auf der Kalenderseite minimal
     anders benennt als im JSON-Feed (der Titel geht in den Dedupe-Schluessel ein). */
  const officialMax = hasOfficial ? Math.max(...officialTs) : -Infinity;

  const merged = new Map();
  const add = (list, label, onlyAfterOfficial) => {
    let n = 0;
    for (const e of list || []) {
      const ts = tsOf(e);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      if (onlyAfterOfficial && hasOfficial && ts <= officialMax) continue;
      merged.set(keyOf(e), e);
      n++;
    }
    console.log(`  ${label}: ${n} Events uebernommen`);
  };

  add(cached, "Cache (Bestand)", true);
  add(scraped, "Folgewoche (gescrapt)", true);
  add(official, "laufende Woche (offizieller Feed)", false);

  const result = [...merged.values()].sort((a, b) => tsOf(a) - tsOf(b));
  if (!result.length) {
    console.error("Ergebnis leer — breche ab, alter Cache bleibt stehen.");
    process.exit(1);
  }

  fs.writeFileSync(outPath, JSON.stringify(result, null, 0));

  const dayCount = new Set(result.map(e => new Date(tsOf(e)).toISOString().slice(0, 10))).size;
  console.log(`Ergebnis: ${result.length} Events ueber ${dayCount} Tage (${result[0].date} .. ${result[result.length - 1].date})`);
  if (!scraped) console.log("Hinweis: Folgewoche konnte nicht gelesen werden — Horizont kommt nur aus Feed + Bestand.");
}

main();
