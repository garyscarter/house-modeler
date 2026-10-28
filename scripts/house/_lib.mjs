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
