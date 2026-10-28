// Draw a house's plot over a north-up map image, so a tracing of the map can be checked by eye.
// Usage: npm run house:map <id> <map.png> --scale <px per m> --origin <x,y> [--bearing deg] [--out file.png]
//   --origin  the pixel on the map where the plot's world point (0, 0) sits (the middle of the plan)
//   --bearing compass bearing the front of the house faces (default: the plot's own frontBearing)
// Plot boundary in red, neighbours in blue, the house footprint (each ground-floor room) in green.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fail, loadHouse, parseArgs, root, screenshot } from "./_lib.mjs";

const { flags, pos } = parseArgs(process.argv.slice(2));
const [id, mapFile] = pos;
const usage = "Usage: npm run house:map <id> <map.png> --scale <px per m> --origin <x,y> [--bearing deg] [--out file.png]";
if (!id || !mapFile) fail(usage);
const scale = Number(flags.scale);
const origin = (flags.origin ?? "").split(",").map(Number);
if (!(scale > 0) || origin.length !== 2 || origin.some((n) => !Number.isFinite(n))) fail(usage);
let map;
try {
  map = readFileSync(mapFile);
} catch {
  fail(`Cannot read ${mapFile}.`);
}
const ext = path.extname(mapFile).slice(1).toLowerCase().replace("jpg", "jpeg");
const { def, geometry } = await loadHouse(id);
const site = def.sitePresets[def.site].build();
const model = def.presets[def.main].build("");
const bearing = flags.bearing === undefined ? site.frontBearing : Number(flags.bearing);
// World +y is the front of the house, which faces `bearing`; on a north-up map that turns the plan by bearing - 180.
const phi = ((bearing - 180) * Math.PI) / 180;
const toMap = (p) => ({
  x: origin[0] + scale * (p.x * Math.cos(phi) - p.y * Math.sin(phi)),
  y: origin[1] + scale * (p.x * Math.sin(phi) + p.y * Math.cos(phi)),
});
const ring = (pts) => pts.map(toMap).map((p) => [p.x, p.y]);
const ground = model.floors.find((f) => f.level === 0) ?? model.floors[0];
const data = {
  boundary: ring(site.boundary),
  neighbours: site.neighbours.map((n) => ({ name: n.name, ring: ring(n.polygon) })),
  rooms: ground.rooms.map((r) => ring(geometry.roomWorldPolygon(ground, r))),
  origin,
  scale,
  bearing,
};
const out = path.resolve(flags.out ?? `map-${id}.png`);
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0}svg{display:block}</style>
<svg id="s" xmlns="http://www.w3.org/2000/svg"></svg>
<script>
const d = ${JSON.stringify(data)};
const s = document.getElementById("s");
const add = (tag, attrs, text) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; s.appendChild(e); return e; };
const pts = (r) => r.map((p) => p[0] + "," + p[1]).join(" ");
const im = new Image();
im.onload = () => {
  const w = im.naturalWidth, h = im.naturalHeight;
  s.setAttribute("width", w); s.setAttribute("height", h); s.setAttribute("viewBox", "0 0 " + w + " " + h);
  add("image", { href: im.src, width: w, height: h });
  add("polygon", { points: pts(d.boundary), fill: "rgba(255,0,0,0.06)", stroke: "#ff0000", "stroke-width": 3 });
  for (const n of d.neighbours) {
    add("polygon", { points: pts(n.ring), fill: "rgba(0,100,255,0.18)", stroke: "#0064ff", "stroke-width": 2 });
    const c = n.ring.reduce((a, p) => [a[0] + p[0] / n.ring.length, a[1] + p[1] / n.ring.length], [0, 0]);
    add("text", { x: c[0], y: c[1], "text-anchor": "middle", fill: "#0040a0", "font-size": 13, "paint-order": "stroke", stroke: "#fff", "stroke-width": 3 }, n.name);
  }
  for (const r of d.rooms) add("polygon", { points: pts(r), fill: "rgba(0,160,60,0.3)", stroke: "#00a03c", "stroke-width": 2 });
  add("circle", { cx: d.origin[0], cy: d.origin[1], r: 5, fill: "#a000c8" });
  add("text", { x: 12, y: 22, fill: "#222", "font-size": 14, "paint-order": "stroke", stroke: "#fff", "stroke-width": 3 }, "boundary red, neighbours blue, house green, origin purple; front faces " + d.bearing + " deg; " + d.scale + " px/m");
  window.__ready = { w, h };
};
im.src = "data:image/${ext || "png"};base64,${map.toString("base64")}";
</script>`;
await screenshot(html, out);
console.log(`Wrote ${path.relative(root, out) || out} (boundary ${site.boundary.length} corners, ${site.neighbours.length} neighbours, front faces ${bearing} deg)`);
