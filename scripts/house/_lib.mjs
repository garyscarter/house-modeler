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

/** The `- [ ]` / `- [x]` items of reference/<id>/INTAKE.md and which files are on disk. */
export function intakeState(id) {
  const ref = path.join(root, "reference", id);
  const intakePath = path.join(ref, "INTAKE.md");
  const text = existsSync(intakePath) ? readFileSync(intakePath, "utf8") : "";
  const items = [...text.matchAll(/^\s*- \[( |x|X)\] (.+)$/gm)].map((m) => ({ done: m[1] !== " ", text: m[2].trim() }));
  const refFiles = filesIn(ref);
  const isMap = (f) => /^map/i.test(f);
  const mapSection = text.split(/^### /m).find((s) => /^Castle on the Hill/.test(s)) ?? "";
  const named = [...mapSection.matchAll(/`([\w.-]+\.(?:png|jpe?g|webp))`/gi)].map((m) => m[1]);
  const files = [
    {
      ok: refFiles.some((f) => IMG.test(f) && !isMap(f)) || filesIn(path.join(root, "src/houses", id, "assets")).some((f) => IMG.test(f)),
      what: "a floorplan image",
      where: `reference/${id}/ (or src/houses/${id}/assets/)`,
    },
    { ok: filesIn(path.join(ref, "photos")).some((f) => f !== ".gitkeep"), what: "photos of the rooms and the outside", where: `reference/${id}/photos/` },
    { ok: refFiles.some(isMap) || named.some((f) => refFiles.includes(f)), what: "a north-up map with a scale", where: `reference/${id}/map.png` },
  ];
  const unticked = items.filter((i) => !i.done);
  const missing = files.filter((f) => !f.ok);
  return { items, unticked, files, missing, hasIntake: !!text, ready: !!text && unticked.length === 0 && missing.length === 0 };
}

export const welcomeText = () => [
  "Welcome to Storey: a browser app for modelling a house in 3D and planning changes to it.",
  "To add your own house, three steps:",
  "  1. Choose a house id: a short slug such as my-semi. Never an address, street, postcode or a name.",
  "  2. Fill in the intake: floorplan, photos, a map and ten short answers (about 30 minutes).",
  "  3. In Claude Code run /eras-tour; it builds the house from your intake.",
  'Start with:  npm run house:start <id> "<Name>"',
  "Any time, npm run welcome shows where you are.",
];

/** Lines describing the intake for the house, for the status and for start.mjs. */
export function intakeLines(id, { cap = Infinity } = {}) {
  const s = intakeState(id);
  const out = [];
  if (!s.hasIntake) return [`reference/${id}/INTAKE.md is missing. Run: npm run house:start ${id} "<Name>"`];
  out.push(`Intake for ${id}: ${s.items.length - s.unticked.length} of ${s.items.length} items ticked.`);
  for (const f of s.files) if (!f.ok) out.push(`  Missing ${f.what}: put it in ${f.where}`);
  const room = Math.max(0, cap - out.length - 2);
  s.unticked.slice(0, room).forEach((i) => out.push(`  [ ] ${i.text.length > 90 ? i.text.slice(0, 87) + "..." : i.text}`));
  if (s.unticked.length > room) out.push(`  ...and ${s.unticked.length - room} more in reference/${id}/INTAKE.md`);
  if (s.unticked.length) out.push(`Tick items in reference/${id}/INTAKE.md (change "[ ]" to "[x]") as you finish them.`);
  if (s.ready) return ["Ready. In Claude Code run /eras-tour."];
  return out;
}
