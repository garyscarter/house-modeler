// Draw a house's traced rooms over its floorplan image, in image pixels, so the tracing can be checked by eye.
// Usage: npm run house:overlay <id> [--floor n] [--out file.png] [--variant <preset id>]
// Rooms are red, openings are coloured by kind (key in the corner), stairs are a purple box with an arrow.
import path from "node:path";
import { fail, floorplanDataUrl, helpAndExit, houseIsIn, loadHouse, parseArgs, screenshot, shotsDir, takeSwallowed, clearPictures, takenLine } from "./_lib.mjs";

const usage = `Usage: npm run house:overlay -- <id> [--floor n] [--out file.png] [--variant <preset id>]
Draws the traced rooms over the floorplan image. The picture goes to /tmp/storey-shots/<id>/overlay-floor<n>.png
unless --out names a file. Flags need -- after the script name when run through npm.`;
helpAndExit(process.argv.slice(2), usage);
const { flags, pos } = parseArgs(process.argv.slice(2));
takeSwallowed(flags, pos, { floor: (v) => /^\d+$/.test(v), out: (v) => /[\/\\]|\.png$/i.test(v), variant: (v) => !houseIsIn(v) }, "house:overlay");
const id = pos[0];
if (!id) fail(usage);
const { def } = await loadHouse(id);
const preset = flags.variant ?? def.main;
if (!def.presets[preset]) fail(`House ${id} has no preset "${preset}" (has: ${Object.keys(def.presets).join(", ")}).`);
const model = def.presets[preset].build("");
const level = flags.floor === undefined ? 0 : Number(flags.floor);
const floor = model.floors.find((f) => f.level === level) ?? model.floors[level];
if (!floor) fail(`No floor ${flags.floor ?? 0} (levels: ${model.floors.map((f) => f.level).join(", ")}).`);
const outDir = shotsDir(id);
if (!flags.out) clearPictures(outDir, /^overlay-floor\d+\.png$/);
const out = flags.out ? path.resolve(flags.out) : path.join(shotsDir(id), `overlay-floor${floor.level}.png`);

const COLOURS = { door: "#ff8c00", window: "#00a0ff", patio: "#00a078", bay: "#00c8ff", front: "#dc0000", garage: "#965000", gap: "#888888", french: "#00a078", bifold: "#00a078", archway: "#c800c8" };
const data = {
  w: floor.imageW,
  h: floor.imageH,
  pxPerM: floor.pxPerM,
  colours: COLOURS,
  rooms: floor.rooms.map((r) => ({ name: r.name, polygon: r.polygon })),
  openings: floor.openings.map((o) => ({ kind: o.kind, x: o.x, y: o.y, o: o.orientation, len: o.widthM * floor.pxPerM })),
  stairs: floor.stairs ? { at: floor.stairs, dir: floor.stairsDir ?? "up", len: (floor.stairsLen ?? 2.6) * floor.pxPerM, width: (floor.stairsWidth ?? 0.9) * floor.pxPerM } : null,
};
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font:14px sans-serif}svg{display:block}</style>
<svg id="s" width="${data.w}" height="${data.h}" viewBox="0 0 ${data.w} ${data.h}" xmlns="http://www.w3.org/2000/svg"></svg>
<script>
const d = ${JSON.stringify(data)};
const img = ${JSON.stringify(floorplanDataUrl(id))};
const s = document.getElementById("s");
const add = (tag, attrs, text) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; s.appendChild(e); return e; };
function draw() {
  add("rect", { width: d.w, height: d.h, fill: "#fbfbfb" });
  if (img) add("image", { href: img, width: d.w, height: d.h });
  for (const r of d.rooms) {
    const pts = r.polygon.map((p) => p.x + "," + p.y).join(" ");
    add("polygon", { points: pts, fill: "rgba(255,0,0,0.08)", stroke: "#ff0000", "stroke-width": 3 });
    const cx = r.polygon.reduce((a, p) => a + p.x, 0) / r.polygon.length, cy = r.polygon.reduce((a, p) => a + p.y, 0) / r.polygon.length;
    add("text", { x: cx, y: cy, "text-anchor": "middle", fill: "#b00000", "font-size": 14, "paint-order": "stroke", stroke: "#fff", "stroke-width": 3 }, r.name);
  }
  for (const o of d.openings) {
    const c = d.colours[o.kind] || "#888";
    const hw = o.o === "h" ? o.len / 2 : 7, hh = o.o === "h" ? 7 : o.len / 2;
    add("rect", { x: o.x - hw, y: o.y - hh, width: hw * 2, height: hh * 2, fill: c, "fill-opacity": 0.8 });
  }
  if (d.stairs) {
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d.stairs.dir];
    const horiz = v[0] !== 0, L = d.stairs.len, W = d.stairs.width;
    const w = horiz ? L : W, h = horiz ? W : L;
    add("rect", { x: d.stairs.at.x - w / 2, y: d.stairs.at.y - h / 2, width: w, height: h, fill: "rgba(160,0,200,0.25)", stroke: "#a000c8", "stroke-width": 3 });
    const x2 = d.stairs.at.x + v[0] * L / 2, y2 = d.stairs.at.y + v[1] * L / 2;
    add("line", { x1: d.stairs.at.x - v[0] * L / 2, y1: d.stairs.at.y - v[1] * L / 2, x2, y2, stroke: "#a000c8", "stroke-width": 4 });
    add("circle", { cx: x2, cy: y2, r: 7, fill: "#a000c8" });
  }
  let y = 16;
  for (const k of [...new Set(d.openings.map((o) => o.kind))]) {
    add("rect", { x: 8, y: y - 10, width: 14, height: 12, fill: d.colours[k] || "#888" });
    add("text", { x: 28, y, fill: "#222", "font-size": 13 }, k); y += 18;
  }
  window.__ready = { w: d.w, h: d.h };
}
draw();
</script>`;
await screenshot(html, out);
console.log(`Wrote ${out} (${floor.name}, ${floor.rooms.length} rooms, ${floor.openings.length} openings${floor.stairs ? ", stairs" : ""}${floorplanDataUrl(id) ? "" : "; no floorplan image yet"})`);
console.log(takenLine());
