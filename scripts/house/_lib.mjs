// Shared by the house overlay scripts: load a house definition through Vite (no extra dependency) and render an
// HTML page to a PNG with the pre-installed Playwright.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** `--flag value` pairs and positionals from argv. */
export function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { flags, pos };
}

export function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** Load src/houses/<id> and the plan maths the overlays need, by way of a Vite dev server in middleware mode. */
export async function loadHouse(id) {
  if (!existsSync(path.join(root, "src/houses", id, "index.ts"))) fail(`No house "${id}" under src/houses/.`);
  const { createServer } = await import(path.join(root, "node_modules/vite/dist/node/index.js"));
  const server = await createServer({ root, appType: "custom", server: { middlewareMode: true, watch: null }, logLevel: "error", optimizeDeps: { noDiscovery: true } });
  try {
    const def = (await server.ssrLoadModule(`/src/houses/${id}/index.ts`)).default;
    const geometry = await server.ssrLoadModule("/src/lib/geometry.ts");
    return { def, geometry };
  } finally {
    await server.close();
  }
}

/** The house's floorplan image from its assets folder as a data URL, or null when there is none yet. */
export function floorplanDataUrl(id) {
  for (const ext of ["webp", "png", "jpg"]) {
    const file = path.join(root, "src/houses", id, "assets", `floorplan.${ext}`);
    if (existsSync(file)) return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${readFileSync(file).toString("base64")}`;
  }
  return null;
}

/** Render `html` (which sets window.__ready = {w, h} once drawn) and save a PNG of that size. */
export async function screenshot(html, out) {
  const require = createRequire("/opt/node22/lib/node_modules/");
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
    const { w, h } = await page.evaluate(() => window.__ready);
    await page.setViewportSize({ width: Math.round(w), height: Math.round(h) });
    await page.screenshot({ path: out });
  } finally {
    await browser.close();
  }
}

export const saveHtml = (file, html) => writeFileSync(file, html);

// ---- First-run welcome and intake state (used by welcome.mjs and start.mjs) ----
import { readdirSync } from "node:fs";

export const localFile = path.join(root, ".storey-local.json");
export const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const IMG = /\.(png|jpe?g|webp)$/i;

/** The gitignored local state: { house, name?, welcomed }, or null when there is none (or it is unreadable). */
export function readLocal() {
  try {
    const v = JSON.parse(readFileSync(localFile, "utf8"));
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
export const writeLocal = (v) => writeFileSync(localFile, JSON.stringify(v) + "\n");

/** Ids under src/houses/ that are real houses (a folder with index.ts), minus the owner's and the template. */
export function otherHouses() {
  const dir = path.join(root, "src/houses");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && d.name !== "listing-91770873")
    .map((d) => d.name);
}

export const houseIsIn = (id) => existsSync(path.join(root, "src/houses", id, "index.ts"));

const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name) : []);

const SONGS = [
  { song: "Shape of You", what: "the floorplan" },
  { song: "Photograph", what: "the photos" },
  { song: "Castle on the Hill", what: "the map" },
  { song: "Thinking Out Loud", what: "the ten answers" },
  { song: "Perfect", what: "checklist ticked, slug chosen" },
];

/** Ed's setlist for reference/<id>/INTAKE.md: each song done or not, from the `- [ ]` / `- [x]` items in its section
 *  (Thinking Out Loud has no boxes: it is done once no `__________` blanks are left) and the files on disk. */
export function intakeState(id) {
  const ref = path.join(root, "reference", id);
  const text = existsSync(path.join(ref, "INTAKE.md")) ? readFileSync(path.join(ref, "INTAKE.md"), "utf8") : "";
  const sections = text.split(/^### /m).slice(1);
  const refFiles = filesIn(ref);
  const isMap = (f) => /^map/i.test(f);
  const fileOk = {
    "Shape of You": refFiles.some((f) => IMG.test(f) && !isMap(f)) || filesIn(path.join(root, "src/houses", id, "assets")).some((f) => IMG.test(f)),
    Photograph: filesIn(path.join(ref, "photos")).some((f) => f !== ".gitkeep"),
    "Castle on the Hill": refFiles.some(isMap),
  };
  const where = {
    "Shape of You": `reference/${id}/ (or src/houses/${id}/assets/)`,
    Photograph: `reference/${id}/photos/`,
    "Castle on the Hill": `reference/${id}/map.png`,
  };
  const songs = SONGS.map(({ song, what }) => {
    const sec = sections.find((x) => x.startsWith(song)) ?? "";
    const items = [...sec.matchAll(/^\s*- \[( |x|X)\] /gm)];
    const unticked = items.filter((m) => m[1] === " ").length;
    const blanks = song === "Thinking Out Loud" ? (sec.match(/`_{3,}`/g) ?? []).length : 0;
    const notes = [];
    if (fileOk[song] === false) notes.push(`put it in ${where[song]}`);
    if (unticked) notes.push(`${unticked} to tick`);
    if (blanks) notes.push(`${blanks} blanks to fill`);
    return { song, what, done: !!sec && notes.length === 0, notes };
  });
  const done = songs.every((x) => x.done);
  return { songs, hasIntake: !!text, ready: !!text && done };
}

export const welcomeText = () => [
  "Doors are open. Storey is a browser app for modelling a house in 3D and planning changes to it.",
  "Ed Sheeran's on first: that's you, getting the intake together. Taylor headlines after:",
  "that's Claude, building your house in eras. Three steps:",
  "  1. Get your ticket: choose a house id, a slug such as my-semi, never an address.",
  "  2. Fill in the intake: floorplan, photos, a map and ten short answers (about 30 minutes).",
  "  3. In Claude Code run /eras-tour.",
  'Your ticket:  npm run house:start <id> "<Name>"   (the id is the name on the ticket)',
  "Any time, npm run welcome shows where you are.",
];

export const ticket = (id) => {
  const rows = ["THE ERAS TOUR · support: Ed Sheeran", `House: ${id}`, "Admit one house"];
  const w = Math.max(...rows.map((r) => r.length));
  return ["┌" + "─".repeat(w + 2) + "┐", ...rows.map((r) => `│ ${r.padEnd(w)} │`), "└" + "─".repeat(w + 2) + "┘"];
};

/** Ed's setlist lines, or the ready line. */
export function intakeLines(id) {
  const s = intakeState(id);
  if (!s.hasIntake) return [`reference/${id}/INTAKE.md is missing. Run: npm run house:start ${id} "<Name>"`];
  if (s.ready) return ["Ed's set is done. Taylor's on next: in Claude Code run /eras-tour."];
  const out = [`Ed's setlist for ${id}:`];
  for (const x of s.songs) out.push(`  [${x.done ? "x" : " "}] ${x.song} (${x.what})${x.done ? "" : ": " + x.notes.join("; ")}`);
  out.push(`Tick items in reference/${id}/INTAKE.md (change "[ ]" to "[x]") as you play them.`);
  return out;
}

// ---- Soundcheck and the surprise song (used by welcome.mjs and soundcheck.mjs) ----

/** Vite 8 needs Node 20.19+ or 22.12+. */
function nodeOk(v = process.versions.node) {
  const [maj, min] = v.split(".").map(Number);
  return maj > 22 || (maj === 22 && min >= 12) || (maj === 20 && min >= 19) || maj === 21 || maj === 23;
}

/**
 * Cheap checks that the checkout can run: Node version, dependencies installed, the house folder the registry will
 * find. Returns one { ok, label, fix } per check; nothing here starts a server or a build.
 */
export function soundcheck(id) {
  const checks = [];
  checks.push({ ok: nodeOk(), label: `Node ${process.versions.node}`, fix: "Install Node 22 (22.12 or later) from nodejs.org, then reopen the terminal." });
  const deps = existsSync(path.join(root, "node_modules/vite/package.json")) && existsSync(path.join(root, "node_modules/react/package.json"));
  checks.push({ ok: deps, label: "dependencies installed", fix: "Run npm ci (if it fails with an edgesOut error: npx -y npm@11.6.2 ci)." });
  checks.push({ ok: existsSync(path.join(root, "src/houses/default.json")), label: "houses registry", fix: "Pull main again: src/houses/default.json is missing." });
  if (id && houseIsIn(id)) {
    const meta = path.join(root, "src/houses", id, "meta.json");
    let named = false;
    try {
      named = typeof JSON.parse(readFileSync(meta, "utf8")).name === "string";
    } catch {}
    checks.push({ ok: named, label: `src/houses/${id}/meta.json`, fix: `Give the house a name: {"name": "..."} in src/houses/${id}/meta.json.` });
  }
  return checks;
}

/** One line for the welcome when everything passes, else a line per failing check with its fix. */
export function soundcheckLines(id) {
  const bad = soundcheck(id).filter((c) => !c.ok);
  if (!bad.length) return [];
  return ["Soundcheck first, before anyone goes on:", ...bad.map((c) => `  [ ] ${c.label}: ${c.fix}`)];
}

/**
 * A random fact from the house's NOTES.md: a bullet line with some substance, cut to one line. Undefined when the
 * notes have no facts yet. `pick` is for tests (0..1).
 */
export function surpriseSong(id, pick = Math.random()) {
  const file = path.join(root, "src/houses", id, "NOTES.md");
  if (!existsSync(file)) return undefined;
  const facts = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "").replace(/`/g, "").trim())
    .filter((l) => l.length > 30);
  if (!facts.length) return undefined;
  const fact = facts[Math.floor(pick * facts.length) % facts.length];
  // The first sentence, unless it is only a lead-in ("Chimney breasts:"), in which case the line itself.
  const first = /:$/.test(fact.split(/(?<=\.)\s/)[0]) || fact.split(/(?<=\.)\s/)[0].length < 30 ? fact : fact.split(/(?<=\.)\s/)[0];
  return first.length > 160 ? first.slice(0, 157).trimEnd() + "…" : first;
}

// ---- Friendship bracelets: one bead per finished era, kept in reference/<id>/tour.json (committed) ----

/** The eras in order: key, the letters on the bead, and whether the era is part of every show. */
export const ERAS = [
  { key: "debut", bead: "DEBUT", core: true },
  { key: "fearless", bead: "FEARLESS", core: true },
  { key: "speak-now", bead: "SPEAK NOW", core: true },
  { key: "red", bead: "RED", core: true },
  { key: "1989", bead: "1989", core: true },
  { key: "reputation", bead: "REP", core: true },
  { key: "lover", bead: "LOVER", core: false },
  { key: "folklore", bead: "FOLKLORE", core: false },
  { key: "taylors-version", bead: "TV", core: false },
  { key: "encore", bead: "ENCORE", core: true },
];

const tourFile = (id) => path.join(root, "reference", id, "tour.json");

/** The era keys this house has finished, in tour order. */
export function beadsOf(id) {
  try {
    const got = new Set(JSON.parse(readFileSync(tourFile(id), "utf8")).eras ?? []);
    return ERAS.filter((e) => got.has(e.key)).map((e) => e.key);
  } catch {
    return [];
  }
}

/** Add an era's bead (idempotent). Returns false for an unknown era. */
export function addBead(id, key) {
  if (!ERAS.some((e) => e.key === key)) return false;
  const eras = [...new Set([...beadsOf(id), key])];
  writeFileSync(tourFile(id), JSON.stringify({ eras: ERAS.filter((e) => eras.includes(e.key)).map((e) => e.key) }, null, 2) + "\n");
  return true;
}

/**
 * The bracelet as one line: Ed's bead first once the intake is ready, then a lettered bead for each finished era and
 * a plain bead for each core era still to come. Fidelity eras appear only once earned.
 */
export function bracelet(id) {
  const got = new Set(beadsOf(id));
  const ed = intakeState(id).ready || got.size > 0;
  const beads = [ed ? "[ED]" : "·"];
  for (const e of ERAS) {
    if (got.has(e.key)) beads.push(`[${e.bead}]`);
    else if (e.core) beads.push("·");
  }
  const core = ERAS.filter((e) => e.core);
  const done = core.filter((e) => got.has(e.key)).length;
  return `Your bracelet: ○─${beads.join("─")}─○  ${done} of ${core.length} eras`;
}

/** The next core era to play, or undefined when the show is complete. */
export function nextEra(id) {
  const got = new Set(beadsOf(id));
  const e = ERAS.find((x) => x.core && !got.has(x.key));
  return e && { key: e.key, name: e.key === "1989" ? "1989" : e.key.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") };
}
