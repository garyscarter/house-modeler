import * as THREE from "three";
import type { Pattern } from "../lib/wallCovering";
import { FULL_HEIGHT_NOMINAL, DADO_HEIGHT } from "../lib/wallCovering";
import { blotches, canvas, css, grain, rng, tint, vary, type Ctx } from "./textures";

/**
 * Modern wall finishes (panelling, boards, metro and zellige tiles, limewash,
 * deco and leaf wallpapers, microcement), drawn once on small canvases. Like
 * the other coverings each covers a known patch of wall in metres, so sizes
 * stay real; each has a height map for normal-mapped relief where it has any.
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

/** How strongly the normal map (from the height map) shows: tiles 0.8, boards and panels 0.5, plasterwork barely. */
const NORMAL_SCALE: Record<ModernCover, number> = {
  panelling: 0.5,
  panellingFull: 0.5,
  batten: 0.5,
  tongue: 0.5,
  metro: 0.8,
  metroSplash: 0.8,
  zellige: 0.8,
  limewash: 0.3,
  deco: 0.5,
  leaves: 0.5,
  jungle: 0.5,
  microcement: 0.2,
};
export const modernNormalScale = (p: ModernCover) => NORMAL_SCALE[p];
/** How much rougher the joints (low in the height map) are than the face: grout on glazed tiles most. */
const JOINT_ROUGHNESS: Record<ModernCover, number> = {
  panelling: 0.1,
  panellingFull: 0.1,
  batten: 0.1,
  tongue: 0.1,
  metro: 0.55,
  metroSplash: 0.55,
  zellige: 0.55,
  limewash: 0,
  deco: 0,
  leaves: 0,
  jungle: 0,
  microcement: 0,
};
export const modernJointRoughness = (p: ModernCover) => JOINT_ROUGHNESS[p];

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

/** Ink and colours of the tropical parrot paper (fixed by design). */
const JG = {
  ink: "#1c2a1e",
  ground: "#e9bfc6",
  sage: "#7ea06a",
  mid: "#3f7a45",
  deep: "#2f5a3a",
  deeper: "#1f3f2a",
  pink: "#c04c7e",
  pinkLight: "#d47aa3",
  pinkDark: "#9a3a68",
  lilac: "#b89ad6",
  orange: "#d9603f",
  beak: "#d9d2c3",
  pine: "#b9b43c",
  crown: "#9fb04a",
  bell: "#e07a8e",
  bellEye: "#b3415e",
};

/** Paints a motif once on its own canvas, radius r about (x, y), and stamps it at every offset that reaches the tile. */
function stamp(c: Ctx, W: number, H: number, x: number, y: number, r: number, paint: (s: Ctx) => void) {
  r = Math.ceil(r);
  const [sc, s] = canvas(2 * r, 2 * r);
  s.translate(r, r);
  s.lineCap = "round";
  s.lineJoin = "round";
  paint(s);
  const x0 = Math.round(x) - r;
  const y0 = Math.round(y) - r;
  for (const dx of [-W, 0, W])
    for (const dy of [-H, 0, H])
      if (x0 + dx < W && y0 + dy < H && x0 + dx + 2 * r > 0 && y0 + dy + 2 * r > 0) c.drawImage(sc, x0 + dx, y0 + dy);
}

/** Inks the current path. */
function ink(s: Ctx, w = 1.5) {
  s.strokeStyle = JG.ink;
  s.lineWidth = w;
  s.stroke();
}

/** Lithograph mottling inside the current clip: small translucent dark and light flecks. */
function mottle(s: Ctx, rnd: () => number, r: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    s.fillStyle = rnd() < 0.6 ? `rgba(10,30,15,${alpha})` : `rgba(220,240,200,${alpha * 0.6})`;
    s.beginPath();
    s.ellipse((rnd() - 0.5) * 2 * r, (rnd() - 0.5) * 2 * r, 1.5 + rnd() * r * 0.03, 1 + rnd() * r * 0.015, rnd() * 3, 0, Math.PI * 2);
    s.fill();
  }
}

/** A lens from (x0, y0) to (x1, y1), w wide at its middle, bowed by bow (fraction of w); filled and inked. */
function lens(s: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, fill: string, bow = 0, lw = 1.1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * w;
  const ny = (dx / L) * w;
  const mx = x0 + dx * 0.5 + nx * bow;
  const my = y0 + dy * 0.5 + ny * bow;
  s.beginPath();
  s.moveTo(x0, y0);
  s.quadraticCurveTo(mx + nx, my + ny, x1, y1);
  s.quadraticCurveTo(mx - nx, my - ny, x0, y0);
  s.fillStyle = fill;
  s.fill();
  ink(s, lw);
}

/** White polka dots on a 12 px stagger (the grid divides the tile, so it wraps), and a few tiny stars. */
function dots(c: Ctx, W: number, H: number, rnd: () => number) {
  const step = 12;
  c.fillStyle = "rgba(255,250,250,0.78)";
  for (let j = 0; j < Math.round(H / step); j++)
    for (let i = 0; i < Math.round(W / step); i++) {
      c.beginPath();
      c.ellipse(i * step + (j % 2) * step * 0.5, j * step, 3.2 + rnd() * 0.6, 2.5 + rnd() * 0.4, 0, 0, Math.PI * 2);
      c.fill();
    }
  c.fillStyle = "#fff";
  for (let k = 0; k < 7; k++) {
    const x = rnd() * W;
    const y = rnd() * H;
    for (const dx of [-W, 0, W])
      for (const dy of [-H, 0, H]) {
        c.beginPath();
        for (let p = 0; p < 10; p++) {
          const r = p % 2 ? 2.4 : 6;
          c.lineTo(x + dx + r * Math.sin((p * Math.PI) / 5), y + dy - r * Math.cos((p * Math.PI) / 5));
        }
        c.fill();
      }
  }
}

/** A pinnate palm frond from its base along +x: curved stem, narrow leaflets either side. */
function palmFrond(s: Ctx, a: number, l: number, bend: number, fill: string, fill2: string, rnd: () => number) {
  s.rotate(a);
  const at = (t: number): [number, number, number] => {
    const x = l * t;
    const y = bend * l * 4 * t * (1 - t) * 0.5;
    return [x, y, Math.atan2(bend * l * 2 * (1 - 2 * t) * 0.5, l)];
  };
  for (const side of [-1, 1])
    for (let t = 0.1; t < 0.97; t += 0.046) {
      const [x, y, th] = at(t);
      const ll = l * (0.3 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.6) + 0.04) * (0.9 + rnd() * 0.2);
      const ang = th + side * (0.95 - 0.45 * t + (rnd() - 0.5) * 0.12);
      lens(s, x, y, x + Math.cos(ang) * ll, y + Math.sin(ang) * ll, ll * 0.09, rnd() < 0.5 ? fill : fill2, side * 0.6, 1);
    }
  s.beginPath();
  s.moveTo(-l * 0.08, 0);
  for (let t = 0; t <= 1; t += 0.05) {
    const [x, y] = at(t);
    s.lineTo(x, y);
  }
  ink(s, 2.2);
}

/** A monstera leaf from its stalk notch along +x: heart-shaped, deep curved splits from the edge, holes by the midrib. */
function monstera(s: Ctx, a: number, l: number, fill: string, fill2: string, rnd: () => number) {
  s.rotate(a);
  s.beginPath();
  s.moveTo(-l * 0.5, l * 0.06);
  s.quadraticCurveTo(-l * 0.2, l * 0.04, 0, 0);
  ink(s, 6);
  s.strokeStyle = fill2;
  s.lineWidth = 3.5;
  s.stroke();
  const blade = () => {
    s.beginPath();
    s.moveTo(0, 0);
    s.bezierCurveTo(-l * 0.14, -l * 0.1, -l * 0.16, -l * 0.42, l * 0.14, -l * 0.47);
    s.bezierCurveTo(l * 0.45, -l * 0.54, l * 0.86, -l * 0.34, l, 0);
    s.bezierCurveTo(l * 0.86, l * 0.34, l * 0.45, l * 0.54, l * 0.14, l * 0.47);
    s.bezierCurveTo(-l * 0.16, l * 0.42, -l * 0.14, l * 0.1, 0, 0);
    s.closePath();
  };
  const dir = (t: number, side: number): [number, number] => {
    const phi = 1.5 - 0.85 * t;
    return [Math.cos(phi), side * Math.sin(phi)];
  };
  s.save();
  blade();
  s.fillStyle = fill;
  s.fill();
  s.clip();
  s.fillStyle = fill2;
  s.fillRect(-l, 0, 2 * l, l);
  mottle(s, rnd, l, 140, 0.14);
  // Pale veins down the middle of each lobe.
  s.strokeStyle = "#8fb487";
  s.lineWidth = 1.3;
  for (let k = 0; k < 7; k++)
    for (const side of [-1, 1]) {
      const t = 0.05 + k * 0.13;
      const [ux, uy] = dir(t, side);
      s.beginPath();
      s.moveTo(t * l, 0);
      s.quadraticCurveTo(t * l + ux * l * 0.3 + l * 0.04, uy * l * 0.3, t * l + ux * l * 0.62 + l * 0.06, uy * l * 0.62);
      s.stroke();
    }
  s.restore();
  s.strokeStyle = "#a9c79a";
  s.lineWidth = Math.max(2, l * 0.012);
  s.beginPath();
  s.moveTo(0, 0);
  s.quadraticCurveTo(l * 0.5, l * 0.02, l * 0.95, 0);
  s.stroke();
  blade();
  ink(s, 1.6);
  // Splits (between the veins) and holes, cut out so whatever is underneath shows; then inked.
  const cuts: (() => void)[] = [];
  for (const side of [-1, 1])
    for (let k = 0; k < 6; k++) {
      const t = 0.115 + k * 0.13 + (rnd() - 0.5) * 0.03;
      const [ux, uy] = dir(t, side);
      const nx = -uy;
      const ny = ux;
      const d0 = l * (0.09 + rnd() * 0.08);
      const w1 = l * (0.035 + rnd() * 0.025);
      const p0 = [t * l + ux * d0, uy * d0];
      const p1 = [t * l + ux * l * 0.75 + l * 0.08, uy * l * 0.75];
      const pc = [(p0[0] + p1[0]) / 2 + l * 0.03, (p0[1] + p1[1]) / 2];
      cuts.push(() => {
        s.moveTo(p0[0], p0[1]);
        s.quadraticCurveTo(pc[0] + nx * w1 * 0.4, pc[1] + ny * w1 * 0.4, p1[0] + nx * w1, p1[1] + ny * w1);
        s.lineTo(p1[0] - nx * w1, p1[1] - ny * w1);
        s.quadraticCurveTo(pc[0] - nx * w1 * 0.4, pc[1] - ny * w1 * 0.4, p0[0], p0[1]);
        s.closePath();
      });
      if (k < 5 && rnd() < 0.8) {
        const th = t + 0.065;
        const [hx, hy] = dir(th, side);
        const hd = l * 0.075;
        const cx = th * l + hx * hd;
        const cy = hy * hd;
        const ang = Math.atan2(hy, hx);
        cuts.push(() => {
          s.moveTo(cx + Math.cos(ang) * l * 0.05, cy + Math.sin(ang) * l * 0.05);
          s.ellipse(cx, cy, l * 0.05, l * 0.017, ang, 0, Math.PI * 2);
        });
      }
    }
  const cutPath = () => {
    s.beginPath();
    for (const f of cuts) f();
  };
  s.save();
  s.globalCompositeOperation = "destination-out";
  cutPath();
  s.fill();
  s.restore();
  s.save();
  blade();
  s.clip();
  cutPath();
  ink(s, 1.4);
  s.restore();
}

/** A long banana-type leaf from its base along +x: dark, dense parallel veins, a couple of tears. */
function bananaLeaf(s: Ctx, a: number, l: number, wd: number, fill: string, fill2: string, rnd: () => number) {
  s.rotate(a);
  const blade = () => {
    s.beginPath();
    s.moveTo(0, 0);
    s.bezierCurveTo(l * 0.12, -wd * 0.9, l * 0.55, -wd * 1.25, l, 0);
    s.bezierCurveTo(l * 0.55, wd * 1.25, l * 0.12, wd * 0.9, 0, 0);
    s.closePath();
  };
  s.save();
  blade();
  s.fillStyle = fill;
  s.fill();
  s.clip();
  s.fillStyle = fill2;
  s.fillRect(-10, 0, l + 20, wd * 2);
  mottle(s, rnd, l * 0.6, 90, 0.14);
  s.strokeStyle = "rgba(15,35,20,0.75)";
  s.lineWidth = 1;
  for (let x = l * 0.04; x < l; x += 5)
    for (const side of [-1, 1]) {
      s.beginPath();
      s.moveTo(x, 0);
      s.quadraticCurveTo(x + wd * 0.25, side * wd * 0.6, x + wd * 0.7, side * wd * 1.3);
      s.stroke();
    }
  s.restore();
  blade();
  ink(s, 1.6);
  s.strokeStyle = "#a9c79a";
  s.lineWidth = 2.2;
  s.beginPath();
  s.moveTo(-l * 0.12, 0);
  s.lineTo(l * 0.95, 0);
  s.stroke();
  s.save();
  s.globalCompositeOperation = "destination-out";
  for (let k = 0; k < 3; k++) {
    const x = l * (0.3 + rnd() * 0.5);
    const side = rnd() < 0.5 ? -1 : 1;
    s.beginPath();
    s.moveTo(x + wd * 0.1, side * wd * 0.25);
    s.lineTo(x + wd * 0.9, side * wd * 1.5);
    s.lineTo(x + wd * 0.98, side * wd * 1.5);
    s.closePath();
    s.fill();
  }
  s.restore();
}

/** A parrot u px long, facing +x (flip mirrors it): perched upright on a twig, or in flight with both wings up. */
function parrot(s: Ctx, a: number, u: number, pose: "perched" | "flying", flip: boolean) {
  s.rotate(a);
  if (flip) s.scale(-1, 1);
  const tail = (x0: number, y0: number, x1: number, y1: number) => {
    lens(s, x0, y0, x1 + u * 0.04, y1, u * 0.035, JG.pinkDark, 0.2);
    lens(s, x0, y0, x1, y1, u * 0.045, JG.pink, -0.2);
    s.strokeStyle = JG.pinkDark;
    s.lineWidth = 0.8;
    for (let k = 1; k < 9; k++) {
      const t = k / 10;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      s.beginPath();
      s.moveTo(x, y);
      s.lineTo(x + (x0 - x1) * 0.05 + (y1 - y0) * 0.03, y + (y0 - y1) * 0.05 - (x1 - x0) * 0.03);
      s.stroke();
    }
  };
  // One row of wing feathers, rooted along the arm from the shoulder (sx, sy) at angle arm, pointing a0 by the body to a1 at the tip.
  const wing = (sx: number, sy: number, arm: number, armL: number, a0: number, a1: number, n: number, len: [number, number], w: number, cols: string[]) => {
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const ang = a0 + (a1 - a0) * t;
      const L = u * (len[0] + (len[1] - len[0]) * t);
      const rx = sx + Math.cos(arm) * armL * u * t;
      const ry = sy + Math.sin(arm) * armL * u * t;
      const [ex, ey] = [Math.cos(ang) * L, Math.sin(ang) * L];
      lens(s, rx, ry, rx + ex, ry + ey, u * w, cols[k % cols.length], 0.25);
      s.strokeStyle = "rgba(28,42,30,0.55)";
      s.lineWidth = 0.8;
      s.beginPath();
      s.moveTo(rx + ex * 0.3, ry + ey * 0.3);
      s.lineTo(rx + ex * 0.92, ry + ey * 0.92);
      s.stroke();
    }
  };
  const head = (hx: number, hy: number, r: number, look: number) => {
    s.beginPath();
    s.arc(hx, hy, r, 0, Math.PI * 2);
    s.fillStyle = "#c85a8a";
    s.fill();
    ink(s);
    s.save();
    s.translate(hx, hy);
    s.rotate(look);
    s.beginPath();
    s.ellipse(r * 0.45, 0, r * 0.45, r * 0.35, 0, 0, Math.PI * 2);
    s.fillStyle = "#f2e6ea";
    s.fill();
    s.beginPath();
    s.arc(r * 0.4, -r * 0.05, r * 0.16, 0, Math.PI * 2);
    s.fillStyle = JG.ink;
    s.fill();
    // Hooked upper beak over a dark lower one.
    s.beginPath();
    s.moveTo(r * 0.8, r * 0.35);
    s.quadraticCurveTo(r * 1.1, r * 0.75, r * 1.05, r * 0.85);
    s.lineTo(r * 0.75, r * 0.7);
    s.closePath();
    s.fillStyle = "#3a3436";
    s.fill();
    ink(s, 1);
    s.beginPath();
    s.moveTo(r * 0.75, -r * 0.4);
    s.bezierCurveTo(r * 1.5, -r * 0.5, r * 1.75, r * 0.4, r * 1.3, r * 0.95);
    s.quadraticCurveTo(r * 1.3, r * 0.45, r * 0.8, r * 0.4);
    s.closePath();
    s.fillStyle = JG.beak;
    s.fill();
    ink(s, 1.2);
    s.restore();
  };
  if (pose === "perched") {
    s.beginPath();
    s.moveTo(-u * 0.35, u * 0.16);
    s.lineTo(u * 0.35, u * 0.08);
    ink(s, 5);
    s.strokeStyle = "#5b4a33";
    s.lineWidth = 3;
    s.stroke();
    tail(-u * 0.02, u * 0.05, -u * 0.14, u * 0.68);
    s.beginPath();
    s.moveTo(u * 0.08, -u * 0.33);
    s.bezierCurveTo(u * 0.22, -u * 0.25, u * 0.18, 0, u * 0.04, u * 0.11);
    s.bezierCurveTo(-u * 0.04, u * 0.13, -u * 0.13, -u * 0.1, -u * 0.04, -u * 0.3);
    s.closePath();
    const g = s.createLinearGradient(-u * 0.1, 0, u * 0.18, 0);
    g.addColorStop(0, JG.pink);
    g.addColorStop(1, JG.pinkLight);
    s.fillStyle = g;
    s.fill();
    ink(s);
    s.strokeStyle = JG.pinkDark;
    s.lineWidth = 0.8;
    for (let k = 0; k < 9; k++) {
      s.beginPath();
      s.arc(u * (0.07 + (k % 3) * 0.035), -u * (0.22 - Math.floor(k / 3) * 0.08), u * 0.02, 0.2, Math.PI - 0.2);
      s.stroke();
    }
    // Folded wing: long magenta primaries to the tip, lilac and orange coverts over them.
    wing(u * 0.05, -u * 0.26, 1.75, 0.16, 1.98, 1.78, 6, [0.3, 0.5], 0.045, [JG.pink, "#b23f72"]);
    wing(u * 0.05, -u * 0.26, 1.75, 0.16, 2.0, 1.8, 5, [0.17, 0.24], 0.045, [JG.lilac, "#c9b0e0"]);
    wing(u * 0.05, -u * 0.26, 1.75, 0.16, 2.0, 1.85, 5, [0.08, 0.12], 0.04, [JG.orange, JG.pinkLight]);
    head(u * 0.1, -u * 0.38, u * 0.085, 0.15);
    s.fillStyle = "#3a3436";
    for (const fx of [0, 0.06]) {
      s.beginPath();
      s.ellipse(u * fx, u * (0.115 - fx * 0.1), u * 0.025, u * 0.012, 0, 0, Math.PI * 2);
      s.fill();
    }
  } else {
    wing(u * 0.03, -u * 0.04, -2.05, 0.22, -3.05, -2.3, 7, [0.16, 0.34], 0.06, [JG.pinkDark, "#86305a"]);
    tail(-u * 0.1, u * 0.02, -u * 0.62, u * 0.12);
    s.beginPath();
    s.ellipse(u * 0.06, u * 0.02, u * 0.2, u * 0.075, 0.05, 0, Math.PI * 2);
    const g = s.createLinearGradient(0, -u * 0.07, 0, u * 0.09);
    g.addColorStop(0, JG.pink);
    g.addColorStop(1, "#c98bc4");
    s.fillStyle = g;
    s.fill();
    ink(s);
    wing(u * 0.08, -u * 0.03, -1.75, 0.26, -3.0, -1.9, 8, [0.2, 0.42], 0.065, [JG.pink, JG.pinkLight, "#b23f72"]);
    wing(u * 0.08, -u * 0.03, -1.75, 0.26, -2.9, -1.95, 7, [0.12, 0.2], 0.06, [JG.lilac, "#c9b0e0"]);
    lens(s, u * 0.1, -u * 0.01, u * 0.08 + Math.cos(-1.75) * u * 0.27, -u * 0.03 + Math.sin(-1.75) * u * 0.27, u * 0.05, JG.pink, -0.4);
    wing(u * 0.08, -u * 0.03, -1.75, 0.24, -2.8, -2.0, 6, [0.07, 0.1], 0.05, [JG.orange, JG.pinkLight]);
    head(u * 0.27, u * 0.05, u * 0.07, 0.35);
  }
}

/** A small pineapple standing at (0, 0): crosshatched body, spiky crown, lime leaves at its foot. */
function pineapple(s: Ctx, a: number, z: number, rnd: () => number) {
  s.rotate(a);
  for (let k = 0; k < 5; k++) {
    const ang = Math.PI / 2 + (k - 2) * 0.5 + (rnd() - 0.5) * 0.2;
    lens(s, 0, -z * 0.05, Math.cos(ang) * z * 0.6, Math.sin(ang) * z * 0.55, z * 0.04, k % 2 ? "#a8d46a" : "#8fbf55", 0.3);
  }
  const body = () => {
    s.beginPath();
    s.ellipse(0, -z * 0.27, z * 0.2, z * 0.27, 0, 0, Math.PI * 2);
  };
  s.save();
  body();
  s.fillStyle = JG.pine;
  s.fill();
  s.clip();
  s.strokeStyle = "#6f6a1f";
  s.lineWidth = 1.1;
  for (let k = -12; k <= 12; k++)
    for (const d of [-1, 1]) {
      s.beginPath();
      s.moveTo(k * z * 0.07 - z * 0.4 * d, -z * 0.6);
      s.lineTo(k * z * 0.07 + z * 0.4 * d, z * 0.05);
      s.stroke();
    }
  s.fillStyle = "#e3da72";
  for (let k = 0; k < 40; k++) {
    s.beginPath();
    s.arc((rnd() - 0.5) * z * 0.4, -z * 0.27 + (rnd() - 0.5) * z * 0.54, 1.3, 0, Math.PI * 2);
    s.fill();
  }
  s.restore();
  body();
  ink(s);
  for (const k of [0, 10, 1, 9, 2, 8, 3, 7, 4, 6, 5]) {
    const ang = -Math.PI / 2 + (k - 5) * 0.2 + (rnd() - 0.5) * 0.1;
    const L = z * (0.62 - Math.abs(k - 5) * 0.06);
    lens(s, 0, -z * 0.48, Math.cos(ang) * L, -z * 0.48 + Math.sin(ang) * L, z * 0.04, [JG.crown, "#7a9a3e", "#b7d66a"][k % 3], 0.2);
  }
}

/** A fan palm: n narrow leaflets radiating from (0, 0) around angle a, spread wide. */
function fanPalm(s: Ctx, a: number, r: number, n: number, spread: number, fill: string, fill2: string, rnd: () => number) {
  for (let k = 0; k < n; k++) {
    const ang = a + (k / (n - 1) - 0.5) * spread + (rnd() - 0.5) * 0.06;
    const L = r * (0.75 + rnd() * 0.25) * (1 - Math.abs(k / (n - 1) - 0.5) * 0.4);
    lens(s, 0, 0, Math.cos(ang) * L, Math.sin(ang) * L, L * 0.07, k % 2 ? fill : fill2, (rnd() - 0.5) * 1.2, 1.2);
    s.strokeStyle = "rgba(15,35,20,0.6)";
    s.lineWidth = 0.9;
    s.beginPath();
    s.moveTo(Math.cos(ang) * L * 0.1, Math.sin(ang) * L * 0.1);
    s.lineTo(Math.cos(ang) * L * 0.9, Math.sin(ang) * L * 0.9);
    s.stroke();
  }
}

/** Drooping pink bells hanging from an arching stem through (0, 0), a couple of open florets among them. */
function bellFlowers(s: Ctx, a: number, z: number, rnd: () => number) {
  s.rotate(a);
  const stem = (t: number): [number, number] => [(t - 0.5) * z * 0.9, -z * 0.5 * t * (1 - t) * 1.2 - z * 0.05];
  s.beginPath();
  for (let t = 0; t <= 1.001; t += 0.1) s.lineTo(...stem(t));
  ink(s, 1.6);
  lens(s, ...stem(0.15), stem(0.15)[0] - z * 0.25, stem(0.15)[1] + z * 0.12, z * 0.06, JG.mid, 0.3);
  lens(s, ...stem(0.85), stem(0.85)[0] + z * 0.22, stem(0.85)[1] - z * 0.18, z * 0.05, JG.mid, -0.3);
  for (let k = 0; k < 6; k++) {
    const [sx, sy] = stem(0.12 + k * 0.15);
    const tx = sx + (rnd() - 0.5) * z * 0.08;
    const ty = sy + z * (0.12 + rnd() * 0.12);
    s.beginPath();
    s.moveTo(sx, sy);
    s.quadraticCurveTo(sx, sy - z * 0.04, tx, ty);
    ink(s, 1);
    if (k === 1 || k === 4) {
      for (let p = 0; p < 5; p++) {
        const pa = (p * Math.PI * 2) / 5;
        lens(s, tx, ty, tx + Math.cos(pa) * z * 0.1, ty + Math.sin(pa) * z * 0.1, z * 0.04, JG.bell, 0, 1);
      }
      s.beginPath();
      s.arc(tx, ty, z * 0.025, 0, Math.PI * 2);
      s.fillStyle = JG.bellEye;
      s.fill();
      continue;
    }
    s.save();
    s.translate(tx, ty);
    s.rotate((rnd() - 0.5) * 0.5);
    s.beginPath();
    s.moveTo(-z * 0.03, 0);
    s.quadraticCurveTo(-z * 0.05, z * 0.1, -z * 0.08, z * 0.15);
    s.quadraticCurveTo(0, z * 0.19, z * 0.08, z * 0.15);
    s.quadraticCurveTo(z * 0.05, z * 0.1, z * 0.03, 0);
    s.closePath();
    s.fillStyle = JG.bell;
    s.fill();
    ink(s, 1.1);
    s.beginPath();
    s.ellipse(0, z * 0.155, z * 0.045, z * 0.018, 0, 0, Math.PI * 2);
    s.fillStyle = JG.bellEye;
    s.fill();
    s.restore();
  }
}

/**
 * Tropical parrot paper: a pink dotted ground under dark monstera and palm leaves, pink parrots, pineapples and
 * flowers, in its own fixed colours (the room's choices are ignored; see hasBaseColour). The canvas wraps both ways.
 */
function drawJungle(): Drawn {
  const [tw, th] = modernTile("jungle");
  const W = Math.round(tw * PX.jungle);
  const H = Math.round(th * PX.jungle);
  const [cc, c] = canvas(W, H);
  const rnd = rng(97);
  const at = (x: number, y: number, r: number, paint: (s: Ctx) => void) => stamp(c, W, H, x * W, y * H, r, paint);
  const j = (v: number) => v + (rnd() - 0.5) * 0.3;
  c.fillStyle = JG.ground;
  c.fillRect(0, 0, W, H);
  blotches(c, W, H, rnd, 14, 0.05, 40, 120);
  dots(c, W, H, rnd);
  // Back: sage and mid-green fronds.
  const fronds: [number, number, number, number, number][] = [
    [0.1, 0.28, -0.7, 470, 0.25], [0.85, 0.1, 2.5, 430, -0.2], [0.5, 0.62, -2.6, 440, 0.2], [0.95, 0.52, 0.6, 400, 0.25],
    [0.15, 0.86, -0.15, 420, -0.25], [0.62, 0.95, -1.9, 420, 0.2], [0.4, 0.3, -0.3, 380, -0.2],
  ];
  fronds.forEach(([x, y, a, l, b], k) => at(x, y, l * 1.1, (s) => palmFrond(s, j(a), l, b, k % 2 ? JG.sage : "#97b47c", k % 2 ? "#6c9461" : JG.sage, rnd)));
  // Middle: dark fan palms, banana and monstera leaves, with mid-green fronds among them.
  at(0.98, 0.56, 200, (s) => fanPalm(s, j(-2.6), 190, 13, 2.4, JG.mid, JG.deep, rnd));
  at(0.42, 0.0, 180, (s) => fanPalm(s, j(-0.9), 170, 11, 2.2, JG.deep, "#356b3f", rnd));
  at(0.3, 0.1, 400, (s) => bananaLeaf(s, j(-0.2), 380, 62, JG.deeper, "#2a4d31", rnd));
  at(0.9, 0.74, 380, (s) => bananaLeaf(s, j(-2.7), 360, 58, JG.deeper, "#2a4d31", rnd));
  at(0.0, 0.42, 330, (s) => bananaLeaf(s, j(-0.5), 310, 50, "#24452c", JG.deeper, rnd));
  at(1.0, 0.46, 320, (s) => bananaLeaf(s, j(-2.85), 300, 48, "#24452c", JG.deeper, rnd));
  at(0.06, 0.95, 210, (s) => fanPalm(s, j(-1.0), 200, 13, 2.5, JG.mid, "#4e8a52", rnd));
  at(0.62, 0.72, 420, (s) => palmFrond(s, j(2.75), 380, -0.2, JG.mid, "#4e8a52", rnd));
  at(0.55, 0.45, 460, (s) => palmFrond(s, j(-1.0), 420, 0.2, JG.mid, "#4e8a52", rnd));
  at(0.05, 0.62, 440, (s) => palmFrond(s, j(2.8), 400, -0.2, JG.mid, "#4e8a52", rnd));
  const mons: [number, number, number, number][] = [
    [0.2, 0.55, -1.2, 320], [0.78, 0.33, -2.0, 290], [0.6, 0.83, -0.5, 300], [0.05, 0.08, 0.6, 230], [0.85, 0.99, -2.4, 230],
  ];
  for (const [x, y, a, l] of mons) at(x, y, l * 1.1, (s) => monstera(s, j(a), l, JG.deep, JG.deeper, rnd));
  // Front: parrots, pineapples, flowers.
  at(0.28, 0.27, 250, (s) => parrot(s, 0.12, 330, "perched", false));
  at(0.58, 0.6, 290, (s) => parrot(s, -0.6, 400, "flying", true));
  at(0.75, 0.12, 225, (s) => pineapple(s, 0.1, 190, rnd));
  at(0.18, 0.77, 215, (s) => pineapple(s, -0.15, 180, rnd));
  at(0.5, 0.32, 100, (s) => bellFlowers(s, 0, 150, rnd));
  at(0.9, 0.93, 100, (s) => bellFlowers(s, 0.2, 150, rnd));
  at(0.06, 0.36, 90, (s) => bellFlowers(s, -0.2, 130, rnd));
  at(0.4, 0.88, 100, (s) => bellFlowers(s, -0.1, 150, rnd));
  at(0.93, 0.67, 90, (s) => bellFlowers(s, 0.3, 130, rnd));
  grain(c, W, H, rnd, 6);
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
