import type { Floor, HouseModel, Site } from "../types";
import { esc, planExtent, planScale, planSvg, toCsv, type PlanFrame } from "./export";
import { CIRCUIT_KIND_LABEL, glyphOffset, POINT_KIND_LABEL, POINT_KINDS, links, numberPoints, pointRows, scheduleRows, totals, type NumberedPoint, type PointKind } from "./electrics";
import { GLYPH_MM, glyphSvg } from "./electricSymbols";
import { gridPoints } from "./lights";
import { fixtureBox } from "./planMath";
import { BRAND_DISPLAY_FONT, BRAND_INK, BRAND_NAME, BRAND_TEAL, markSvg, wordmarkSvg } from "./brand";
import { gridOf, type Symbol } from "./catalogue";

/**
 * The wiring guide for the electrician (Electrics mode and Review): per floor, the scaled plan (export.ts planSvg)
 * with an electrical layer (numbered point symbols, dashed switch-to-light arcs), a legend of the symbols used, the
 * per-room schedule and the totals; and the schedule as CSV, one row per point. Pure strings, like export.ts.
 * Dua Lipa implements the bodies; the signatures are the contract (docs/electrics-plan.md).
 */

export interface WiringGuideInput {
  /** Long date for the title blocks and footer, already formatted. */
  date: string;
  /** "Listing 91770873". */
  houseName?: string;
  /** The layout the guide is of (the Proposed one when it exists), e.g. "Proposed". */
  variantLabel: string;
  model: HouseModel;
  /** For the plans' north arrow. */
  site?: Site;
  /** CSS inserted into the style block (the report's embedded font). */
  fontCss?: string;
}

const INK = "#1f2937";
const FONT = "Helvetica, Arial, sans-serif";
const f2 = (v: number) => Math.round(v * 100) / 100;
/** Label text height on paper, mm. */
const LABEL_MM = 2;

interface Xy {
  x: number;
  y: number;
}

/** Where a point's label goes and which way its symbol faces the room, in paper mm. */
function labelText(x: number, y: number, text: string, anchor: "start" | "middle" | "end"): string {
  return `<text x="${f2(x)}" y="${f2(y)}" font-size="${LABEL_MM}" font-family="${FONT}" text-anchor="${anchor}" dominant-baseline="central" fill="${INK}" stroke="#fff" stroke-width="0.6" paint-order="stroke" stroke-linejoin="round">${esc(text)}</text>`;
}

/**
 * The electrical layer of one floor in a planSvg frame (pass it as PlanSvgOptions.overlay): each point's symbol at its
 * place (a downlight grid as one downlight per bulb, a strip light as a line at its length), its number beside it away
 * from the wall, dashed arcs from switches to the lights on this floor and short stubs to the other floors.
 */
export function electricalLayerSvg(model: HouseModel, floor: Floor, numbered: NumberedPoint[], frame: PlanFrame): string {
  const here = numbered.filter((p) => p.floor.id === floor.id);
  if (!here.length) return "";
  const k = frame.k;
  const glyphM = GLYPH_MM / k;
  const out: string[] = [];
  const where = new Map<string, { c: Xy; dir: Xy }>();
  const labels: string[] = [];
  const syms: string[] = [];
  for (const p of here) {
    const { fx, item } = p;
    const a = (fx.rot * Math.PI) / 180;
    const off = p.item.ceiling || item.symbol === "socket-floor" ? { x: 0, y: 0 } : glyphOffsetM(p, glyphM);
    const c = { x: frame.x({ x: p.at.x + off.x, y: p.at.y + off.y }), y: frame.y({ x: p.at.x + off.x, y: p.at.y + off.y }) };
    const wall = !item.ceiling && item.symbol !== "socket-floor";
    const dir = wall ? { x: -Math.sin(a), y: Math.cos(a) } : { x: 1, y: 0 };
    where.set(fx.id, { c, dir });
    const box = fixtureBox(fx, item, model.ceilingHeight);
    let hx = GLYPH_MM / 2;
    if (item.symbol === "downlight-grid" || item.symbol === "strip-light") {
      const bulbs = item.symbol === "strip-light" ? [] : gridPoints(box.w, box.d, gridOf(fx, item), 0);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const at = (lx: number, lz: number): Xy => ({ x: frame.x({ x: p.at.x + lx * ca - lz * sa, y: p.at.y + lx * sa + lz * ca }), y: frame.y({ x: p.at.x + lx * ca - lz * sa, y: p.at.y + lx * sa + lz * ca }) });
      if (item.symbol === "strip-light") {
        const e1 = at(-box.w / 2, 0);
        const e2 = at(box.w / 2, 0);
        syms.push(`<line x1="${f2(e1.x)}" y1="${f2(e1.y)}" x2="${f2(e2.x)}" y2="${f2(e2.y)}" stroke="${INK}" stroke-width="0.7" stroke-linecap="round"/>`);
        hx = Math.max(GLYPH_MM / 2, (Math.abs(e2.x - e1.x) + 0) / 2);
      } else {
        let maxX = 0;
        for (const [bx, , bz] of bulbs) {
          const q = at(bx, bz);
          syms.push(glyphSvg("downlight", q.x, q.y, GLYPH_MM, { ink: INK }));
          maxX = Math.max(maxX, Math.abs(q.x - c.x));
        }
        hx = maxX + GLYPH_MM / 2;
      }
    } else {
      syms.push(glyphSvg(item.symbol, c.x, c.y, GLYPH_MM, { rot: fx.rot, ink: INK }));
    }
    if (wall) {
      const r = GLYPH_MM / 2 + 1.5;
      const anchor = dir.x > 0.5 ? "start" : dir.x < -0.5 ? "end" : "middle";
      const lx = c.x + dir.x * (anchor === "middle" ? 0 : r - 0.5);
      const ly = c.y + dir.y * (anchor === "middle" ? r : 0) + (anchor === "middle" ? 0 : dir.y * r);
      labels.push(labelText(lx, ly, p.label, anchor));
    } else {
      labels.push(labelText(c.x + hx + 0.8, c.y, p.label, "start"));
    }
  }

  // Links between points on this floor, and stubs to the other floors.
  const stubs = new Map<string, number>();
  const stub = (id: string, text: string) => {
    const w = where.get(id)!;
    const n = stubs.get(id) ?? 0;
    stubs.set(id, n + 1);
    const perp = { x: -w.dir.y, y: w.dir.x };
    const r0 = GLYPH_MM / 2 + 0.3;
    const x1 = w.c.x + w.dir.x * r0 + perp.x * n * 2.4;
    const y1 = w.c.y + w.dir.y * r0 + perp.y * n * 2.4;
    const x2 = x1 + w.dir.x * 6;
    const y2 = y1 + w.dir.y * 6;
    const anchor = w.dir.x > 0.5 ? "start" : w.dir.x < -0.5 ? "end" : "middle";
    out.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${BRAND_TEAL}" stroke-width="0.25" stroke-dasharray="1 0.8"/>`);
    out.push(labelText(x2 + w.dir.x * 0.6, y2 + w.dir.y * 1.4, text, anchor));
  };
  for (const l of links(model, numbered)) {
    const f = l.from.floor.id === floor.id;
    const t = l.to.floor.id === floor.id;
    if (f && t) {
      const a = where.get(l.from.fx.id)!.c;
      const b = where.get(l.to.fx.id)!.c;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const cx = (a.x + b.x) / 2 - (dy / len) * len * 0.2;
      const cy = (a.y + b.y) / 2 + (dx / len) * len * 0.2;
      out.push(`<path d="M${f2(a.x)} ${f2(a.y)} Q${f2(cx)} ${f2(cy)} ${f2(b.x)} ${f2(b.y)}" fill="none" stroke="${BRAND_TEAL}" stroke-width="0.25" stroke-dasharray="1 0.8"/>`);
    } else if (f) stub(l.from.fx.id, `to ${l.to.floor.name} ${l.to.room.name} ${l.to.label}`);
    else if (t) stub(l.to.fx.id, `from ${l.from.floor.name} ${l.from.room.name} ${l.from.label}`);
  }
  return `<g class="electrics" font-family="${FONT}">${out.join("")}${syms.join("")}${labels.join("")}</g>`;
}

/** glyphOffset in metres for a numbered point. */
function glyphOffsetM(p: NumberedPoint, glyphM: number): Xy {
  return glyphOffset(p.fx, p.item, glyphM);
}

const kindLabel = (k: PointKind) => POINT_KIND_LABEL[k];

/** The printable guide: a self-contained HTML page like printHtml's. */
export function wiringGuideHtml(p: WiringGuideInput): string {
  const numbered = numberPoints(p.model);
  const rows = pointRows(p.model, numbered);
  const mk = (px: number) => `<svg viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true">${markSvg(BRAND_TEAL)}</svg>`;
  const sec: string[] = [];
  sec.push(
    `<header><div class="brand">${mk(26)}<span class="wordmark">${wordmarkSvg(BRAND_INK, 17)}</span></div>` +
      `<p class="eyebrow">Wiring guide · ${esc(p.date)}</p>` +
      `<h1>${esc(p.houseName || "House")} wiring guide</h1>` +
      `<p class="muted">Layout: ${esc(p.variantLabel)}</p>` +
      `<p class="note">New points only. Heights are to the centre of the plate. Check every position on site with the electrician.</p></header>`,
  );

  if (!numbered.length) {
    sec.push(`<p class="muted">No electrical points yet: place them in Electrics mode.</p>`);
  } else {
    // Legend: one row per symbol used anywhere in the model.
    const used = new Map<Symbol, { kind: PointKind; names: string[] }>();
    for (const n of numbered) {
      const e = used.get(n.item.symbol) ?? { kind: n.kind, names: [] };
      if (!e.names.includes(n.item.name)) e.names.push(n.item.name);
      used.set(n.item.symbol, e);
    }
    const legend = POINT_KINDS.flatMap((kind) => {
      const list = [...used.entries()].filter(([, e]) => e.kind === kind);
      if (!list.length) return [];
      return [
        `<h3>${esc(kindLabel(kind))}</h3>`,
        `<ul class="legend">${list
          .map(([sym, e]) => `<li><svg viewBox="0 0 8 8" width="8mm" height="8mm" aria-hidden="true">${glyphSvg(sym, 4, 4, 5.5, { ink: INK })}</svg><span>${esc(e.names.join(", "))}</span></li>`)
          .join("")}</ul>`,
      ];
    });
    sec.push(`<section class="sheet"><h2>Legend</h2>${legend.join("")}</section>`);

    // Plans, one per page, framed alike.
    const extent = planExtent([p.model]);
    const scale = planScale(extent);
    for (const f of [...p.model.floors].sort((a, b) => a.level - b.level)) {
      const svg = planSvg(p.model, f, { variant: p.variantLabel, date: p.date, site: p.site, extent, scale, title: "Wiring guide", overlay: (frame) => electricalLayerSvg(p.model, f, numbered, frame) }).replace(/^<\?xml[^>]*>\n/, "");
      sec.push(`<section class="plan">${svg}</section>`);
    }

    // Schedule per floor and room.
    const sched = scheduleRows(rows);
    const body: string[] = [];
    let lastFloor = "";
    let lastRoom = "";
    for (const r of sched) {
      if (r.floor !== lastFloor) {
        body.push(`<tr class="floor"><th colspan="7">${esc(r.floor)}</th></tr>`);
        lastFloor = r.floor;
        lastRoom = "";
      }
      const room = r.room === lastRoom ? "" : r.room;
      lastRoom = r.room;
      body.push(`<tr${room ? ` class="first"` : ""}><td>${esc(room)}</td><td>${esc(r.labels)}</td><td>${esc(r.type)}</td><td class="num">${r.count}</td><td class="num">${esc(r.height)}</td><td>${esc(r.circuit)}</td><td>${esc(r.notes)}</td></tr>`);
    }
    sec.push(`<section class="sheet sched"><h2>Schedule</h2><table class="sched"><tr><th>Room</th><th>Point</th><th>Type</th><th class="num">Count</th><th class="num">Height</th><th>Circuit</th><th>Notes</th></tr>${body.join("")}</table></section>`);

    // Totals.
    const tot = totals(rows);
    const grand = tot.reduce((a, t) => a + t.count, 0);
    sec.push(
      `<section class="sheet"><h2>Totals</h2><table class="tot"><tr><th>Type</th><th class="num">Count</th></tr>${tot.map((t) => `<tr><td>${esc(t.type)}</td><td class="num">${t.count}</td></tr>`).join("")}` +
        `<tr class="grand"><td>All points</td><td class="num">${grand}</td></tr></table></section>`,
    );

    // Circuits.
    if (p.model.circuits?.length) {
      const byFx = new Map(numbered.map((n) => [n.fx.id, n]));
      const crow = p.model.circuits.map((c) => {
        const pts = c.points.map((id) => byFx.get(id)).filter((x): x is NumberedPoint => !!x).map((x) => `${x.room.name} ${x.label}`);
        return `<tr><td>${esc(c.name)}</td><td>${esc(CIRCUIT_KIND_LABEL[c.kind])}</td><td>${pts.length ? esc(pts.join(", ")) : "–"}</td></tr>`;
      });
      sec.push(`<section class="sheet"><h2>Circuits</h2><table><tr><th>Circuit</th><th>Kind</th><th>Points</th></tr>${crow.join("")}</table></section>`);
    }
  }

  const foot = `<footer class="made">${mk(12)}<span>Made with ${BRAND_NAME}${p.houseName ? ` · ${esc(p.houseName)}` : ""} · ${esc(p.date)}</span></footer>`;
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.houseName ? `${p.houseName} wiring guide` : "Wiring guide")} · ${BRAND_NAME}</title>
<style>
${p.fontCss ?? ""}
@page { size: A4 portrait; margin: 12mm; }
body { font: 10.5pt/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1d2422; margin: 0 auto; max-width: 190mm; padding: 12px; }
h1, h2, .wordmark { font-family: ${BRAND_DISPLAY_FONT}; }
h1 { font-size: 18pt; margin: 0 0 2px; } h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 2px solid ${BRAND_TEAL}; padding-bottom: 2px; }
.brand { display: flex; align-items: center; gap: 7px; } .wordmark { display: inline-flex; padding-top: 3px; }
.eyebrow { margin: 8px 0 2px; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; color: #6a736f; }
footer.made { display: flex; align-items: center; gap: 5px; margin-top: 24px; padding-top: 6px; border-top: 1px solid #dde1dc; font-size: 8pt; color: #6a736f; }
h3 { font-size: 10pt; margin: 10px 0 4px; }
.muted { color: #6a736f; } .note { background: #fefce8; border: 1px solid #fde68a; padding: 6px 8px; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #dde1dc; vertical-align: top; }
th { background: #f4f5f2; } td.num, th.num { text-align: right; white-space: nowrap; }
tr { break-inside: avoid; }
tr.floor th { background: #fff; padding-top: 10px; border-bottom: 1px solid #6a736f; }
tr.first td { border-top: 1px solid #b8beb9; }
tr.grand td { font-weight: 700; border-top: 2px solid #1d2422; }
ul.legend { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(60mm, 1fr)); gap: 2px 10px; }
ul.legend li { display: flex; align-items: center; gap: 8px; font-size: 9.5pt; } ul.legend svg { flex: none; }
section { break-inside: avoid-page; }
section.sheet { break-inside: auto; }
section.plan { break-before: page; text-align: center; padding-top: 6px; }
section.sched { break-before: page; }
section.plan svg { max-width: 100%; height: auto; }
.bar { position: sticky; top: 0; background: #fff; padding: 8px 0; border-bottom: 1px solid #dde1dc; display: flex; gap: 8px; align-items: center; }
.bar button { font: inherit; padding: 6px 12px; border: 1px solid #2563eb; background: #2563eb; color: #fff; border-radius: 6px; }
@media print { .bar { display: none; } body { padding: 0; max-width: none; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Print / save as PDF</button><span class="muted">Choose "Save as PDF" as the printer to keep a copy. Plans print to scale at 100%.</span></div>
${sec.join("\n")}
${foot}
</body></html>`;
}

/** The schedule as CSV, one row per point (lib/electrics.ts pointRows). */
export function scheduleCsv(model: HouseModel): string {
  const rows = pointRows(model);
  return toCsv([["Floor", "Room", "Point", "Type", "Quantity", "Height", "Circuit", "Notes"], ...rows.map((r) => [r.floor, r.room, r.label, r.type, r.quantity, r.height, r.circuit, r.notes])]);
}
