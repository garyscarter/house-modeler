import * as THREE from "three";
import type { Pattern } from "../lib/wallCovering";
import { FULL_HEIGHT_NOMINAL, DADO_HEIGHT } from "../lib/wallCovering";
import { blotches, canvas, css, grain, rng, tint, vary, type Ctx } from "./textures";

/**
 * Modern wall finishes (panelling, boards, metro and zellige tiles, limewash,
 * deco and leaf wallpapers, microcement), drawn once on small canvases. Like
 * the other coverings each covers a known patch of wall in metres, so sizes
 * stay real; each has a height map for bump relief where it has any.
 *
 * Only functions here use the helpers imported from textures.ts (the two
 * files import each other), never anything at module level.
 */

export type ModernCover = "panelling" | "panellingFull" | "batten" | "tongue" | "metro" | "metroSplash" | "zellige" | "limewash" | "deco" | "leaves" | "jungle" | "microcement";

const MODERN: ReadonlySet<string> = new Set<ModernCover>(["panelling", "panellingFull", "batten", "tongue", "metro", "metroSplash", "zellige", "limewash", "deco", "leaves", "jungle", "microcement"]);
export const isModern = (p: Pattern): p is ModernCover => MODERN.has(p);

/** Width of a wallpaper roll, metres. */
const ROLL = 0.53;

/** Size of one repeat, metres. Fitted ones (panelling, boards) are one piece high; see COVER_LAYOUT. */
export function modernTile(p: ModernCover): [number, number] {
  switch (p) {
    case "panelling":
      return [0.56, DADO_HEIGHT];
    case "tongue":
      return [0.4, DADO_HEIGHT];
    case "panellingFull":
      return [0.56, FULL_HEIGHT_NOMINAL];
    case "batten":
      return [0.3, 0.6];
    case "metro":
    case "metroSplash":
      return [1.2, 0.6];
    case "zellige":
      return [1, 1];
    case "limewash":
    case "microcement":
      return [1.6, 1.6];
    case "deco":
      return [ROLL, ROLL];
    case "leaves":
      return [2 * ROLL, 1.2];
    case "jungle":
      return [ROLL, 0.8];
  }
}

/** Canvas pixels per metre. */
const PX: Record<ModernCover, number> = {
  panelling: 400,
  tongue: 400,
  panellingFull: 300,
  batten: 400,
  metro: 600,
  metroSplash: 600,
  zellige: 560,
  limewash: 200,
  microcement: 200,
  deco: 800,
  leaves: 320,
  jungle: 1200,
};

const ROUGHNESS: Record<ModernCover, number> = {
  panelling: 0.55,
  panellingFull: 0.55,
  batten: 0.6,
  tongue: 0.6,
  metro: 0.22,
  metroSplash: 0.22,
  zellige: 0.2,
  limewash: 0.95,
  deco: 0.85,
  leaves: 0.85,
  jungle: 0.85,
  microcement: 0.5,
};
export const modernRoughness = (p: ModernCover) => ROUGHNESS[p];

/** How strongly the height map shows. */
const BUMP: Record<ModernCover, number> = {
  panelling: 1.4,
  panellingFull: 1.4,
  batten: 1.4,
  tongue: 1.2,
  metro: 1.2,
  metroSplash: 1.2,
  zellige: 1,
  limewash: 0.35,
  deco: 1,
  leaves: 1,
  jungle: 1,
  microcement: 0.25,
};
export const modernBump = (p: ModernCover) => BUMP[p];

type Drawn = { color: HTMLCanvasElement; height: HTMLCanvasElement | null };

const grey = (g: number) => `rgb(${Math.round(g)},${Math.round(g)},${Math.round(g)})`;

/** Concentric rectangles from the outer grey to the inner one: a soft edge on a height map. */
function ramp(h: Ctx, x: number, y: number, w: number, ht: number, outer: number, inner: number, steps: number) {
  for (let k = 0; k < steps; k++) {
    h.fillStyle = grey(outer + ((inner - outer) * (k + 1)) / steps);
    h.fillRect(x + k, y + k, w - 2 * k, ht - 2 * k);
  }
}

/** Soft strokes with a faded cross-section, laid at random angles, wrapped over the repeat's edges. */
function strokes(ctx: Ctx, W: number, H: number, rnd: () => number, n: number, len: [number, number], wid: [number, number], alpha: number, spread: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const l = len[0] + rnd() * (len[1] - len[0]);
    const w = wid[0] + rnd() * (wid[1] - wid[0]);
    const a = (rnd() > 0.5 ? 0.6 : -0.6) + (rnd() - 0.5) * spread;
    const light = rnd() > 0.5;
    const al = alpha * (0.4 + rnd() * 0.6);
    for (const ox of [-W, 0, W])
      for (const oy of [-H, 0, H]) {
        ctx.save();
        ctx.translate(x + ox, y + oy);
        ctx.rotate(a);
        const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
        const c = light ? "255,255,255" : "0,0,0";
        g.addColorStop(0, `rgba(${c},0)`);
        g.addColorStop(0.5, `rgba(${c},${al})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(-l / 2, -w / 2, l, w);
        ctx.restore();
      }
  }
}

/**
 * Painted shaker panelling in one piece from the floor up. `panels` are the recessed
 * panels as [bottom, top] metres above the floor; `cap` is the height of a top
 * moulding that catches the light, or 0. Rails and stiles are the colour itself.
 */
function drawShaker(p: "panelling" | "panellingFull", hex: string): Drawn {
  const [tw, th] = modernTile(p);
  const px = PX[p];
  const W = Math.round(tw * px);
  const H = Math.round(th * px);
  const [cc, c] = canvas(W, H);
  const [hc, h] = canvas(W, H);
  const rnd = rng(31);
  const base = new THREE.Color(hex);
  const panels: [number, number][] = p === "panelling" ? [[0.16, 0.93]] : [[0.16, 0.9], [1.02, th - 0.16]];
  const cap = p === "panelling" ? 0.06 : 0;
  // Panels sit 40 mm in from the repeat's edge, so a stile of 80 mm falls between neighbours.
  const x0 = 0.04 * px;
  const pw = (tw - 0.08) * px;
  const Y = (v: number) => (th - v) * px;
  c.fillStyle = hex;
  c.fillRect(0, 0, W, H);
  h.fillStyle = grey(190);
  h.fillRect(0, 0, W, H);
  const dark = css(tint(base, 0, 1, 0.965));
  for (const [v0, v1] of panels) {
    const y = Y(v1);
    const ph = Y(v0) - y;
    // The recessed panel, darker at the top where the frame shades it.
    c.fillStyle = dark;
    c.fillRect(x0, y, pw, ph);
    const g = c.createLinearGradient(0, y, 0, y + 0.05 * px);
    g.addColorStop(0, "rgba(0,0,0,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(x0, y, pw, 0.05 * px);
    const lg = c.createLinearGradient(x0, 0, x0 + 0.03 * px, 0);
    lg.addColorStop(0, "rgba(0,0,0,0.10)");
    lg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = lg;
    c.fillRect(x0, y, 0.03 * px, ph);
    // Inner edges of the frame: shadow on top and left, a lit edge below and right.
    const e = Math.max(1.5, 0.004 * px);
    c.fillStyle = "rgba(0,0,0,0.30)";
    c.fillRect(x0, y, pw, e);
    c.fillRect(x0, y, e, ph);
    c.fillStyle = "rgba(255,255,255,0.40)";
    c.fillRect(x0, y + ph - e, pw, e);
    c.fillRect(x0 + pw - e, y, e, ph);
    // The frame's own square bead just outside the panel.
    c.strokeStyle = "rgba(0,0,0,0.10)";
    c.lineWidth = 1;
    c.strokeRect(x0 - e - 0.5, y - e - 0.5, pw + 2 * e + 1, ph + 2 * e + 1);
    // Height: the panel is a step down with a soft edge.
    h.fillStyle = grey(118);
    h.fillRect(x0, y, pw, ph);
    ramp(h, x0, y, pw, ph, 190, 118, 3);
  }
  if (cap > 0) {
    // A top moulding: a lit face, a bright arris and a shadow under it.
    const y = Y(th);
    const ch = cap * px;
    c.fillStyle = css(tint(base, 0, 1, 1.04));
    c.fillRect(0, y, W, ch);
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.fillRect(0, y, W, 1.5);
    c.fillStyle = "rgba(0,0,0,0.2)";
    c.fillRect(0, y + ch - 1.5, W, 1.5);
    const g = c.createLinearGradient(0, y + ch, 0, y + ch + 0.03 * px);
    g.addColorStop(0, "rgba(0,0,0,0.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, y + ch, W, 0.03 * px);
    h.fillStyle = grey(235);
    h.fillRect(0, y, W, ch);
    ramp(h, 0, y, W, ch, 200, 240, 3);
  }
  grain(c, W, H, rnd, 4);
  return { color: cc, height: hc };
}

/** Vertical tongue and groove boards with a bead at each joint and a rail along the top. */
function drawTongue(hex: string): Drawn {
  const [tw, th] = modernTile("tongue");
  const px = PX.tongue;
  const W = Math.round(tw * px);
  const H = Math.round(th * px);
  const [cc, c] = canvas(W, H);
  const [hc, h] = canvas(W, H);
  const rnd = rng(37);
  const base = new THREE.Color(hex);
  const board = 0.1 * px;
  h.fillStyle = grey(200);
  h.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const x = i * board;
    c.fillStyle = vary(base, rnd, 0.012);
    c.fillRect(x, 0, board, H);
    // V-groove: a dark line with a lit lip beside it, and a fine bead line inside the board.
    const gw = Math.max(1.5, 0.003 * px);
    c.fillStyle = "rgba(0,0,0,0.38)";
    c.fillRect(x, 0, gw, H);
    c.fillStyle = "rgba(255,255,255,0.28)";
    c.fillRect(x + gw, 0, Math.max(1, 0.0025 * px), H);
    c.fillStyle = "rgba(0,0,0,0.10)";
    c.fillRect(x + 0.012 * px, 0, 1, H);
    h.fillStyle = grey(70);
    h.fillRect(x, 0, gw, H);
    h.fillStyle = grey(150);
    h.fillRect(x + gw, 0, 2, H);
  }
  // Faint painted-wood streaks.
  for (let i = 0; i < W * 1.2; i++) {
    c.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)";
    c.fillRect(rnd() * W, rnd() * H, 1, 8 + rnd() * 50);
  }
  // The top rail: a lit face with a shadow beneath it.
  const ch = 0.07 * px;
  c.fillStyle = css(tint(base, 0, 1, 1.04));
  c.fillRect(0, 0, W, ch);
  c.fillStyle = "rgba(255,255,255,0.5)";
  c.fillRect(0, 0, W, 1.5);
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.fillRect(0, ch - 2, W, 2);
  const g = c.createLinearGradient(0, ch, 0, ch + 0.03 * px);
  g.addColorStop(0, "rgba(0,0,0,0.32)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, ch, W, 0.03 * px);
  h.fillStyle = grey(240);
  h.fillRect(0, 0, W, ch);
  grain(c, W, H, rnd, 4);
  return { color: cc, height: hc };
}

/** Board and batten: flat boards with narrow battens over the joints, each casting a thin shadow. */
function drawBatten(hex: string): Drawn {
  const [tw, th] = modernTile("batten");
  const px = PX.batten;
  const W = Math.round(tw * px);
  const H = Math.round(th * px);
  const [cc, c] = canvas(W, H);
  const [hc, h] = canvas(W, H);
  const rnd = rng(41);
  c.fillStyle = hex;
  c.fillRect(0, 0, W, H);
  h.fillStyle = grey(120);
  h.fillRect(0, 0, W, H);
  const bw = 0.045 * px;
  // Battens at the repeat's edge, split across it so they run on to the next repeat.
  for (const x of [-bw / 2, W - bw / 2]) {
    const sh = c.createLinearGradient(x + bw, 0, x + bw + 0.02 * px, 0);
    sh.addColorStop(0, "rgba(0,0,0,0.30)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = sh;
    c.fillRect(x + bw, 0, 0.02 * px, H);
    c.fillStyle = css(new THREE.Color(hex).multiplyScalar(1.03));
    c.fillRect(x, 0, bw, H);
    c.fillStyle = "rgba(255,255,255,0.45)";
    c.fillRect(x, 0, 1.5, H);
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(x + bw - 1.5, 0, 1.5, H);
    h.fillStyle = grey(235);
    h.fillRect(x, 0, bw, H);
    h.fillStyle = grey(175);
    h.fillRect(x - 2, 0, 2, H);
    h.fillRect(x + bw, 0, 2, H);
  }
  // A faint board joint down the middle of each board.
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(Math.round(W / 2), 0, 1, H);
  grain(c, W, H, rnd, 4);
  return { color: cc, height: hc };
}

/** 75 x 150 mm bevelled metro tiles in running (brick) bond, in grout of the accent colour. */
function drawMetro(hex: string, groutHex: string): Drawn {
  const [tw, th] = modernTile("metro");
  const px = PX.metro;
  const W = Math.round(tw * px);
  const H = Math.round(th * px);
  const [cc, c] = canvas(W, H);
  const [hc, h] = canvas(W, H);
  const rnd = rng(43);
  const base = new THREE.Color(hex);
  const tileW = 0.15 * px;
  const tileH = 0.075 * px;
  const joint = 0.003 * px;
  c.fillStyle = groutHex;
  c.fillRect(0, 0, W, H);
  h.fillStyle = grey(40);
  h.fillRect(0, 0, W, H);
  const cols = Math.round(tw / 0.15);
  const rows = Math.round(th / 0.075);
  for (let r = 0; r < rows; r++) {
    const y = r * tileH + joint / 2;
    const th2 = tileH - joint;
    for (let i = 0; i <= cols; i++) {
      const x = i * tileW + (r % 2 ? tileW / 2 : 0) - tileW / 2 + joint / 2;
      const tone = vary(base, rnd, 0.03, 0.006);
      for (const ox of [0, -W]) {
        const tx = x + ox;
        const tw2 = tileW - joint;
        c.fillStyle = tone;
        c.fillRect(tx, y, tw2, th2);
        // Glaze: a sheen across the face and the bevel catching light at the top and dark at the foot.
        const g = c.createLinearGradient(tx, y, tx + tw2 * 0.6, y + th2);
        g.addColorStop(0, "rgba(255,255,255,0.13)");
        g.addColorStop(0.5, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(0,0,0,0.05)");
        c.fillStyle = g;
        c.fillRect(tx, y, tw2, th2);
        const b = Math.max(1.5, 0.002 * px);
        c.fillStyle = "rgba(255,255,255,0.5)";
        c.fillRect(tx, y, tw2, b);
        c.fillRect(tx, y, b, th2);
        c.fillStyle = "rgba(0,0,0,0.16)";
        c.fillRect(tx, y + th2 - b, tw2, b);
        c.fillRect(tx + tw2 - b, y, b, th2);
        h.fillStyle = grey(215);
        h.fillRect(tx, y, tw2, th2);
        ramp(h, tx, y, tw2, th2, 120, 215, 3);
      }
    }
  }
  grain(c, W, H, rnd, 3);
  return { color: cc, height: hc };
}

/** Handmade 100 mm zellige: each square a little off true, its glaze pooled darker at the edges and varied in tone. */
function drawZellige(hex: string, groutHex: string): Drawn {
  const [tw, th] = modernTile("zellige");
  const px = PX.zellige;
  const W = Math.round(tw * px);
  const H = Math.round(th * px);
  const [cc, c] = canvas(W, H);
  const [hc, h] = canvas(W, H);
  const rnd = rng(47);
  const base = new THREE.Color(hex);
  const n = Math.round(tw / 0.1);
  const cell = W / n;
  const joint = 0.0045 * px;
  const jit = 0.0014 * px;
  c.fillStyle = groutHex;
  c.fillRect(0, 0, W, H);
  h.fillStyle = grey(40);
  h.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = i * cell + joint / 2 + jit;
      const y = j * cell + joint / 2 + jit;
      const s = cell - joint - 2 * jit;
      const corner = () => (rnd() - 0.5) * 2 * jit;
      const pts: [number, number][] = [
        [x + corner(), y + corner()],
        [x + s + corner(), y + corner()],
        [x + s + corner(), y + s + corner()],
        [x + corner(), y + s + corner()],
      ];
      const quad = (ctx: Ctx) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
      };
      // Tone varies a lot from tile to tile, as handmade glaze does.
      const tone = new THREE.Color().copy(base);
      const hsl = { h: 0, s: 0, l: 0 };
      tone.getHSL(hsl);
      tone.setHSL((hsl.h + (rnd() - 0.5) * 0.02 + 1) % 1, Math.min(1, hsl.s * (0.85 + rnd() * 0.3)), Math.max(0, Math.min(1, hsl.l + (rnd() - 0.5) * 0.12)));
      c.fillStyle = css(tone);
      quad(c);
      c.fill();
      // Glaze pooling: lighter heart, darker rim, off-centre.
      const cx = x + s * (0.35 + rnd() * 0.3);
      const cy = y + s * (0.35 + rnd() * 0.3);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, s * 0.85);
      g.addColorStop(0, "rgba(255,255,255,0.16)");
      g.addColorStop(0.6, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(0,0,0,0.20)");
      c.fillStyle = g;
      quad(c);
      c.fill();
      // A fine crackle and a bright spot or two.
      c.strokeStyle = "rgba(0,0,0,0.07)";
      c.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        c.beginPath();
        const sx = x + rnd() * s;
        const sy = y + rnd() * s;
        c.moveTo(sx, sy);
        c.lineTo(sx + (rnd() - 0.5) * s * 0.6, sy + (rnd() - 0.5) * s * 0.6);
        c.stroke();
      }
      // Height: an uneven face, higher in a random corner, with a rolled edge.
      const hg = h.createLinearGradient(x, y, x + s * (rnd() > 0.5 ? 1 : -1), y + s);
      const g0 = 150 + rnd() * 30;
      hg.addColorStop(0, grey(g0));
      hg.addColorStop(1, grey(g0 + 30 + rnd() * 25));
      h.fillStyle = hg;
      quad(h);
      h.fill();
      h.strokeStyle = grey(110);
      h.lineWidth = 2;
      quad(h);
      h.stroke();
    }
  grain(c, W, H, rnd, 3);
  return { color: cc, height: hc };
}

/** Limewash and microcement share a method: soft brush or trowel marks laid over the colour. */
function drawPlasterwork(p: "limewash" | "microcement", hex: string): Drawn {
  const [tw, th] = modernTile(p);
  const px = PX[p];
  const W = Math.round(tw * px);
  const H = Math.round(th * px);
  const [cc, c] = canvas(W, H);
  const [hc, h] = canvas(W, H);
  c.fillStyle = hex;
  c.fillRect(0, 0, W, H);
  h.fillStyle = grey(128);
  h.fillRect(0, 0, W, H);
  // The same seed on both canvases lays the same marks, so relief follows the visible mottling.
  const lay = (ctx: Ctx, seed: number, h2: boolean) => {
    const rnd = rng(seed);
    if (p === "limewash") {
      blotches(ctx, W, H, rnd, 30, h2 ? 0.04 : 0.045, 0.25 * px, 0.7 * px);
      strokes(ctx, W, H, rnd, 70, [0.35 * px, 0.8 * px], [0.15 * px, 0.35 * px], h2 ? 0.1 : 0.05, 1.6);
      blotches(ctx, W, H, rnd, 60, 0.03, 0.05 * px, 0.2 * px);
    } else {
      blotches(ctx, W, H, rnd, 22, h2 ? 0.03 : 0.045, 0.3 * px, 0.8 * px);
      strokes(ctx, W, H, rnd, 120, [0.25 * px, 0.6 * px], [0.1 * px, 0.22 * px], h2 ? 0.08 : 0.04, 2.4);
    }
  };
  lay(c, p === "limewash" ? 53 : 59, false);
  lay(h, p === "limewash" ? 53 : 59, true);
  const rnd = rng(61);
  if (p === "microcement")
    // Fine pores in the sealed surface.
    for (let i = 0; i < W * H * 0.0012; i++) {
      c.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.1})`;
      c.fillRect(rnd() * W, rnd() * H, 1, 1);
    }
  grain(c, W, H, rnd, p === "limewash" ? 6 : 8);
  return { color: cc, height: hc };
}

/** Art-deco scallops: overlapping fans in concentric lines, two across the roll. */
function drawDeco(hex: string, accentHex: string): Drawn {
  const [tw] = modernTile("deco");
  const W = Math.round(tw * PX.deco);
  const [cc, c] = canvas(W, W);
  const rnd = rng(67);
  const base = new THREE.Color(hex);
  const accent = new THREE.Color(accentHex);
  const r = W / 4;
  c.fillStyle = hex;
  c.fillRect(0, 0, W, W);
  c.lineCap = "round";
  // Rows are drawn from the bottom up, so each fan tucks under the row above it. Four rows (and so two
  // different offsets) fill the repeat; the extra rows at either end carry the pattern over its edges.
  for (let k = 7; k >= -4; k--) {
    const cy = k * r;
    for (let i = -1; i <= 2; i++) {
      const cx = (i + (((k % 2) + 2) % 2) * 0.5) * 2 * r;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = css(base.clone().lerp(accent, ((k % 4) + 4) % 4 < 2 ? 0.05 : 0.02));
      c.fill();
      // A little depth: darker toward the fan's rim.
      const g = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.045)");
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = accentHex;
      for (const [f, wd] of [[0.97, 0.0032], [0.76, 0.0022], [0.55, 0.0022], [0.34, 0.0022]] as const) {
        c.lineWidth = wd * PX.deco;
        c.beginPath();
        c.arc(cx, cy, r * f, 0, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = accentHex;
      c.beginPath();
      c.arc(cx, cy, r * 0.09, 0, Math.PI * 2);
      c.fill();
    }
  }
  grain(c, W, W, rnd, 5);
  return { color: cc, height: null };
}

/** A large tropical leaf from its base at (x, y) pointing along angle a: length l, half-width wd. */
function bigLeaf(ctx: Ctx, x: number, y: number, a: number, l: number, wd: number, fill: string, fill2: string, vein: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const half = (sign: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(l * 0.12, sign * wd * 0.9, l * 0.55, sign * wd * 1.25, l, 0);
    ctx.bezierCurveTo(l * 0.62, sign * wd * 0.15, l * 0.2, sign * wd * 0.1, 0, 0);
    ctx.closePath();
  };
  ctx.fillStyle = fill;
  half(-1);
  ctx.fill();
  ctx.fillStyle = fill2;
  half(1);
  ctx.fill();
  ctx.strokeStyle = vein;
  ctx.lineCap = "round";
  // Side veins sweep out and forward from the midrib.
  ctx.lineWidth = Math.max(1, l * 0.004);
  for (let k = 1; k <= 9; k++) {
    const t = k / 10;
    const reach = wd * (1.05 - Math.abs(t - 0.4) * 0.9) * 0.78;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(l * t, 0);
      ctx.quadraticCurveTo(l * (t + 0.05), sign * reach * 0.55, l * (t + 0.13), sign * reach);
      ctx.stroke();
    }
  }
  ctx.lineWidth = Math.max(1.5, l * 0.009);
  ctx.beginPath();
  ctx.moveTo(-l * 0.18, 0);
  ctx.lineTo(l * 0.96, 0);
  ctx.stroke();
  ctx.restore();
}

/** Big banana-style leaves in a half-drop, each in two tones either side of its midrib; low contrast on the paper. */
function drawLeaves(hex: string, accentHex: string): Drawn {
  const [tw, th] = modernTile("leaves");
  const W = Math.round(tw * PX.leaves);
  const H = Math.round(th * PX.leaves);
  const sx = W / tw;
  const [cc, c] = canvas(W, H);
  const rnd = rng(71);
  const base = new THREE.Color(hex);
  const accent = new THREE.Color(accentHex);
  c.fillStyle = hex;
  c.fillRect(0, 0, W, H);
  type L = { x: number; y: number; a: number; l: number; w: number; t: number };
  const leaves: L[] = [];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 3; j++) {
      const x = (0.28 + i * 0.5) * W;
      const y = ((j + 0.5 * i + 0.7) / 3) * H;
      // A big leaf leaning up and out, with a small one tucked at its foot.
      const lean = (i ? 1 : -1) * (0.25 + rnd() * 0.3);
      leaves.push({ x, y, a: -Math.PI / 2 + lean, l: (0.42 + rnd() * 0.1) * sx, w: (0.1 + rnd() * 0.025) * sx, t: rnd() });
      leaves.push({ x: x + (i ? 0.09 : -0.09) * sx, y: y + 0.06 * sx, a: -Math.PI / 2 + (i ? 1.1 : -1.1) + (rnd() - 0.5) * 0.3, l: (0.24 + rnd() * 0.05) * sx, w: 0.06 * sx, t: rnd() });
    }
  const dark = (f: number) => css(base.clone().lerp(accent, f));
  // Stems first, so leaves overlap them.
  for (const dx of [-W, 0, W])
    for (const dy of [-H, 0, H]) {
      c.strokeStyle = dark(0.8);
      c.lineWidth = 0.003 * sx;
      c.lineCap = "round";
      for (const { x, y, a, l } of leaves) {
        c.beginPath();
        c.moveTo(x + dx, y + dy);
        c.quadraticCurveTo(x + dx - Math.cos(a) * l * 0.2, y + dy - Math.sin(a) * l * 0.2 + 0.05 * sx, x + dx - Math.cos(a) * l * 0.4, y + dy - Math.sin(a) * l * 0.4 + 0.12 * sx);
        c.stroke();
      }
      for (const { x, y, a, l, w, t } of leaves) bigLeaf(c, x + dx, y + dy, a, l, w, dark(0.72 + t * 0.12), dark(0.55 + t * 0.12), dark(0.95));
    }
  grain(c, W, H, rnd, 5);
  return { color: cc, height: null };
}

/**
 * Tropical parrot paper: a pink dotted ground under dark monstera and palm leaves, pink parrots, pineapples and
 * flowers, in its own fixed colours (the room's choices are ignored; see hasBaseColour). Half-drop on one roll width.
 */
function drawJungle(): Drawn {
  const [tw, th] = modernTile("jungle");
  const W = Math.round(tw * PX.jungle);
  const H = Math.round(th * PX.jungle);
  const [cc, c] = canvas(W, H);
  c.fillStyle = "#e9bfc6";
  c.fillRect(0, 0, W, H);
  return { color: cc, height: null };
}

/**
 * The colour (and height) canvas of a modern covering. `hex` is the main colour
 * (panelling and boards: the wood-paint colour; tiles: the tile colour) and
 * `accentHex` the second one (grout, pattern) where the covering has one.
 */
export function drawModern(p: ModernCover, hex: string, accentHex: string | null): Drawn {
  const second = accentHex ?? hex;
  switch (p) {
    case "panelling":
    case "panellingFull":
      return drawShaker(p, hex);
    case "tongue":
      return drawTongue(hex);
    case "batten":
      return drawBatten(hex);
    case "metro":
    case "metroSplash":
      return drawMetro(hex, second);
    case "zellige":
      return drawZellige(hex, second);
    case "limewash":
    case "microcement":
      return drawPlasterwork(p, hex);
    case "deco":
      return drawDeco(hex, second);
    case "leaves":
      return drawLeaves(hex, second);
    case "jungle":
      return drawJungle();
  }
}
