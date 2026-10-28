// `npm run house:shot -- <id> [--out dir] [--variant current|proposed] [--views home,top,front,rear,left,right]`: pictures of a house as the app draws it, for
// checking an era's work by eye. Starts its own dev server with only this house, opens it in headless Chromium
// (see launchBrowser in _lib.mjs: the container's Chromium, or the installed Chrome or Edge), and saves
// 3d-<view>.png for each view in --views (default home,top; the side views click the view cube) and
// plan-<floor>.png for every floor, framed on the rooms with the plan's fit control, into the output folder (default
// /tmp/storey-shots/<id>). Prints the files and any page errors.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fail, helpAndExit, launchBrowser, parseArgs, root, takeSwallowed } from "./_lib.mjs";

const VIEWS = { home: "Home view", top: "Look at the top", front: "Look at the front", rear: "Look at the rear", left: "Look at the left", right: "Look at the right" };
const usage = `Usage: npm run house:shot -- <id> [--out dir] [--variant current|proposed] [--views home,top]
Pictures of the house as the app draws it: 3d-<view>.png for each view (${Object.keys(VIEWS).join(", ")}; default home,top)
and plan-<floor>.png for every floor. Saved in /tmp/storey-shots/<id>/ unless --out names a folder.
Flags need -- after the script name when run through npm.`;
helpAndExit(process.argv.slice(2), usage);
const { flags, pos } = parseArgs(process.argv.slice(2));
takeSwallowed(flags, pos, { views: (v) => v.split(",").every((x) => x in VIEWS), out: (v) => /[\/\\]/.test(v), variant: (v) => v === "current" || v === "proposed" }, "house:shot");
const id = pos[0];
if (!id) fail(usage);
const views = (flags.views ?? "home,top").split(",").map((v) => v.trim()).filter(Boolean);
const badView = views.find((v) => !(v in VIEWS));
if (badView || !views.length) fail(`Unknown view "${badView}". Views: ${Object.keys(VIEWS).join(", ")}.`);
if (!existsSync(path.join(root, "src/houses", id, "index.ts"))) fail(`No house "${id}" under src/houses/.`);
const out = path.resolve(flags.out ?? path.join("/tmp/storey-shots", id));
mkdirSync(out, { recursive: true });

process.env.VITE_HOUSES = id;
const { createServer } = await import(path.join(root, "node_modules/vite/dist/node/index.js"));
const server = await createServer({ root, logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}/`;

const browser = await launchBrowser();
const errors = [];
const saved = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector(".welcome-tile, .dock", { timeout: 90000 });
  if (await page.locator(".welcome-tile").count()) {
    const tiles = page.locator(".welcome-tile");
    await tiles.nth(flags.variant === "proposed" && (await tiles.count()) > 1 ? 1 : 0).click();
  }
  await page.waitForSelector(".dock, .tab-bar", { timeout: 90000 });
  const floors = await page.evaluate((v) => {
    const s = window.__houseStore.getState();
    const key = v === "proposed" && s.variants.proposed ? "proposed" : "current";
    s.setUi({ activeVariant: key, tab: "3d", maxLevel: null });
    return [...s.variants[key].floors].sort((a, b) => a.level - b.level).map((f) => ({ id: f.id, name: f.name }));
  }, flags.variant);
  // The 3D view loads its own chunk and compiles shaders (slowly under software GL): wait for its canvas and for the
  // "Preparing the 3D view" loader to go, then let a few frames draw.
  const ready3d = () =>
    page.waitForFunction(() => !!document.querySelector("canvas") && !/Preparing the 3D view/.test(document.body.innerText), null, { timeout: 180000 });
  const snap = async (name) => {
    if (name.startsWith("3d")) await ready3d();
    await page.waitForTimeout(name.startsWith("3d") ? 6000 : 2500);
    const file = path.join(out, name);
    await page.screenshot({ path: file });
    saved.push(file);
  };
  for (const v of views) {
    // The view cube buttons; Home is the camera the app opens on.
    const button = page.locator(`[aria-label="${VIEWS[v]}"]`).first();
    if (!(await button.count())) {
      errors.push(`No view cube button for "${v}"; skipped.`);
      continue;
    }
    await button.click();
    await snap(`3d-${v}.png`);
  }
  for (const f of floors) {
    await page.evaluate((fid) => window.__houseStore.getState().setUi({ tab: "plan", editFloorId: fid }), f.id);
    await page.waitForTimeout(1500);
    // Fit the rooms so the plan fills the frame rather than sitting small in a corner.
    const fit = page.locator('[aria-label="Fit the rooms (F)"]').first();
    if (await fit.count()) await fit.click();
    else errors.push(`No fit control on the ${f.name} plan.`);
    await snap(`plan-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(saved.join("\n"));
console.log(errors.length ? `Page errors:\n${errors.join("\n")}` : "No page errors.");
process.exit(errors.length ? 1 : 0);
