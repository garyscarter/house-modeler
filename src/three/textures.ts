import * as THREE from "three";
import type { FloorFinish, WallFinish } from "../types";
import { overflow } from "../lib/cache";
import type { Pattern } from "../lib/wallCovering";

/**
 * Procedural finishes drawn on canvases once and cached. Each texture covers
 * a known patch of wall or floor in metres (TILE_M) and geometry carries UVs
 * in metres, so bricks, boards and tiles keep their real size on any wall.
 * Every finish has a matching height map used as a bump map for relief.
 */

type Ctx = CanvasRenderingContext2D;

/** Size of one texture repeat, metres (width along u, height along v). */
const WALL_TILE: Record<WallFinish, [number, number]> = {
  // 4 bricks of 215 mm + 10 mm joints by 8 courses of 65 mm + 10 mm joints.
  brick: [0.9, 0.6],
  render: [2, 2],
  pebbledash: [1, 1],
  stone: [1.2, 1.2],
  cladding: [1.2, 1.2],
};
const FLOOR_TILE: Record<Exclude<FloorFinish, "plain">, [number, number]> = {
  oak: [2.4, 1.2],
  laminate: [2.4, 1.2],
  tile: [1.2, 1.2],
  quarry: [0.9, 0.9],
  stone: [1.8, 1.2],
  carpet: [0.5, 0.5],
  vinyl: [1.2, 1.2],
  concrete: [2, 2],
};
/** Canvas pixels per metre: fine enough for close-ups, small enough for phones. */
const WALL_PX: Record<WallFinish, number> = { brick: 1100, render: 256, pebbledash: 512, stone: 420, cladding: 420 };
const FLOOR_PX: Record<Exclude<FloorFinish, "plain">, number> = {
  oak: 420,
  laminate: 420,
  tile: 420,
  quarry: 560,
  stone: 420,
  carpet: 512,
  vinyl: 420,
  concrete: 256,
};

/** Typical colour of each floor finish, used when the room has no colour of its own. */
export const FLOOR_COLOUR: Record<Exclude<FloorFinish, "plain">, string> = {
  oak: "#b88a58",
  laminate: "#c9b393",
  tile: "#e4e0d8",
  quarry: "#9a4a35",
  stone: "#b7ae9f",
  carpet: "#d4c8b6",
  vinyl: "#d5d0c6",
  concrete: "#a9a8a3",
};
const FLOOR_ROUGHNESS: Record<Exclude<FloorFinish, "plain">, number> = {
  oak: 0.55,
  laminate: 0.5,
  tile: 0.3,
  quarry: 0.6,
  stone: 0.75,
  carpet: 1,
  vinyl: 0.45,
  concrete: 0.85,
};
const WALL_ROUGHNESS: Record<WallFinish, number> = { brick: 0.95, render: 0.92, pebbledash: 1, stone: 0.95, cladding: 0.85 };

/** Width of a wallpaper roll, metres; patterns repeat across it. */
const ROLL = 0.53;
/** Large-format wall tiles, laid portrait in a stack bond, and the optional mosaic feature strip. */
const WALL_TILE_W = 0.25;
const WALL_TILE_H = 0.4;
const MOSAIC = 0.05;
/** Small square splashback tiles, 150 mm, six by six to a repeat. */
const SQUARE = 0.15;
const SQUARES = 6;
/** Size of one repeat of each covering, metres; tiles are wider when they carry a strip. */
function coverTile(p: Pattern, strip: boolean): [number, number] {
  switch (p) {
    case "stripe":
      return [ROLL, ROLL];
    case "floral":
      return [ROLL, 0.64];
    case "rose":
      return [ROLL, 0.62];
    case "trail":
      return [ROLL, 0.48];
    case "sprig":
      return [ROLL, 0.36];
    case "tiles":
      return [6 * WALL_TILE_W + (strip ? 2 * MOSAIC : 0), 3 * WALL_TILE_H];
    case "squares":
      return [SQUARES * SQUARE, SQUARES * SQUARE];
    case "brick":
      return WALL_TILE.brick;
  }
}
const COVER_PX: Record<Exclude<Pattern, "brick">, number> = { stripe: 512, floral: 900, rose: 900, trail: 900, sprig: 900, tiles: 512, squares: 700 };
const COVER_ROUGHNESS: Record<Pattern, number> = { stripe: 0.8, floral: 0.88, rose: 0.85, trail: 0.88, sprig: 0.88, tiles: 0.28, squares: 0.3, brick: WALL_ROUGHNESS.brick };

/** Small deterministic PRNG so textures look the same on every load. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** Base colour varied in lightness (and a touch of hue), as a CSS colour. */
function vary(base: THREE.Color, rnd: () => number, light: number, hue = 0): string {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const c = new THREE.Color().setHSL(
    (hsl.h + (rnd() - 0.5) * hue + 1) % 1,
    hsl.s,
    Math.max(0, Math.min(1, hsl.l + (rnd() - 0.5) * light)),
  );
  return "#" + c.getHexString();
}

/** A colour shifted in hue and scaled in saturation and lightness. */
function tint(base: THREE.Color, dh: number, sMul: number, lMul: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  return new THREE.Color().setHSL((hsl.h + dh + 1) % 1, Math.min(1, hsl.s * sMul), Math.min(1, hsl.l * lMul));
}

const css = (c: THREE.Color) => "#" + c.getHexString();

/** Add per-pixel grain: +-amount on each channel. */
function grain(ctx: Ctx, w: number, h: number, rnd: () => number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = (rnd() - 0.5) * amount;
    d[i] += g;
    d[i + 1] += g;
    d[i + 2] += g;
  }
  ctx.putImageData(img, 0, 0);
}

/** Soft blotches for render, plaster and concrete, wrapped so the tile repeats. */
function blotches(ctx: Ctx, w: number, h: number, rnd: () => number, n: number, alpha: number, r0: number, r1: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = r0 + rnd() * (r1 - r0);
    const light = rnd() > 0.5;
    for (const ox of [-w, 0, w])
      for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, light ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
}

/** Fill a rectangle that may run off the right edge, wrapping it to the left so the tile repeats. */
function wrapRect(ctx: Ctx, w: number, x: number, y: number, rw: number, rh: number) {
  ctx.fillRect(x, y, rw, rh);
  if (x + rw > w) ctx.fillRect(x - w, y, rw, rh);
  if (x < 0) ctx.fillRect(x + w, y, rw, rh);
}

interface Painted {
  color: HTMLCanvasElement;
  height: HTMLCanvasElement;
}

function drawWall(finish: WallFinish, hex: string, mortar = "#c9c3b6"): Painted {
  const [tw, th] = WALL_TILE[finish];
  const W = Math.round(tw * WALL_PX[finish]);
  const H = Math.round(th * WALL_PX[finish]);
  const [cc, c] = canvas(W, H);
  const [hc, h] = canvas(W, H);
  const base = new THREE.Color(hex);
  const rnd = rng(7);
  const sx = W / tw;
  const sy = H / th;
  switch (finish) {
    case "brick": {
      c.fillStyle = mortar;
      c.fillRect(0, 0, W, H);
      h.fillStyle = "#303030";
      h.fillRect(0, 0, W, H);
      const bw = 0.215 * sx;
      const bh = 0.065 * sy;
      const jx = 0.01 * sx;
      const jy = 0.01 * sy;
      for (let row = 0; row < 8; row++) {
        const y = row * (bh + jy) + jy / 2;
        const shift = row % 2 ? (bw + jx) / 2 : 0;
        for (let k = 0; k < 5; k++) {
          const x = shift + k * (bw + jx) + jx / 2;
          if (x >= W) continue;
          // Per-brick colour: most near the base, the odd darker or burnt one.
          const burnt = rnd() < 0.08;
          c.fillStyle = vary(burnt ? base.clone().multiplyScalar(0.78) : base, rnd, 0.1, 0.018);
          wrapRect(c, W, x, y, bw, bh);
          h.fillStyle = `rgb(${200 + rnd() * 40},${200 + rnd() * 40},${200 + rnd() * 40})`;
          wrapRect(h, W, x, y, bw, bh);
        }
      }
      grain(c, W, H, rnd, 26);
      grain(h, W, H, rnd, 30);
      break;
    }
    case "render": {
      c.fillStyle = hex;
      c.fillRect(0, 0, W, H);
      blotches(c, W, H, rnd, 24, 0.018, 20, 90);
      grain(c, W, H, rnd, 8);
      h.fillStyle = "#808080";
      h.fillRect(0, 0, W, H);
      grain(h, W, H, rnd, 50);
      break;
    }
    case "pebbledash": {
      c.fillStyle = vary(base, rnd, 0);
      c.fillRect(0, 0, W, H);
      h.fillStyle = "#505050";
      h.fillRect(0, 0, W, H);
      for (let i = 0; i < 9000; i++) {
        const x = rnd() * W;
        const y = rnd() * H;
        const r = 1 + rnd() * 2.6;
        c.fillStyle = vary(base, rnd, 0.3, 0.06);
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        const v = 150 + rnd() * 100;
        h.fillStyle = `rgb(${v},${v},${v})`;
        h.beginPath();
        h.arc(x, y, r, 0, Math.PI * 2);
        h.fill();
      }
      grain(c, W, H, rnd, 12);
      break;
    }
    case "stone": {
      // Coursed stone: rows of different heights, blocks of random length.
      c.fillStyle = "#b9b3a6";
      c.fillRect(0, 0, W, H);
      h.fillStyle = "#202020";
      h.fillRect(0, 0, W, H);
      const rows = [0.18, 0.24, 0.15, 0.27, 0.2, 0.16];
      const scale = th / rows.reduce((s, v) => s + v, 0);
      const joint = 0.015;
      let y = 0;
      for (const r of rows) {
        const rh = r * scale;
        let x = rnd() * 0.3;
        const start = x;
        while (x < start + tw - 0.2) {
          const len = Math.min(0.28 + rnd() * 0.4, start + tw - x);
          c.fillStyle = vary(base, rnd, 0.2, 0.04);
          wrapRect(c, W, (x + joint / 2) * sx, (y + joint / 2) * sy, (len - joint) * sx, (rh - joint) * sy);
          const v = 170 + rnd() * 70;
          h.fillStyle = `rgb(${v},${v},${v})`;
          wrapRect(h, W, (x + joint / 2) * sx, (y + joint / 2) * sy, (len - joint) * sx, (rh - joint) * sy);
          x += len;
        }
        // Close the course where it wraps.
        const len = start + tw - x;
        if (len > joint) {
          c.fillStyle = vary(base, rnd, 0.2, 0.04);
          wrapRect(c, W, (x + joint / 2) * sx, (y + joint / 2) * sy, (len - joint) * sx, (rh - joint) * sy);
          h.fillStyle = "#c0c0c0";
          wrapRect(h, W, (x + joint / 2) * sx, (y + joint / 2) * sy, (len - joint) * sx, (rh - joint) * sy);
        }
        y += rh;
      }
      blotches(c, W, H, rnd, 30, 0.05, 10, 40);
      grain(c, W, H, rnd, 22);
      grain(h, W, H, rnd, 40);
      break;
    }
    case "cladding": {
      // Horizontal boards 150 mm high, each with grain and a shadow line under its lap.
      const bh = 0.15 * sy;
      for (let i = 0; i < 8; i++) {
        const y = i * bh;
        c.fillStyle = vary(base, rnd, 0.1, 0.02);
        c.fillRect(0, y, W, bh);
        for (let g = 0; g < 14; g++) {
          c.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.06})`;
          c.lineWidth = 1 + rnd() * 1.5;
          const gy = y + rnd() * bh;
          c.beginPath();
          c.moveTo(0, gy);
          for (let x = 0; x <= W; x += W / 8) c.lineTo(x, gy + Math.sin(x / 60 + g) * 2);
          c.stroke();
        }
        c.fillStyle = "rgba(0,0,0,0.35)";
        c.fillRect(0, y + bh - 3, W, 3);
        const grad = h.createLinearGradient(0, y, 0, y + bh);
        grad.addColorStop(0, "#606060");
        grad.addColorStop(1, "#e0e0e0");
        h.fillStyle = grad;
        h.fillRect(0, y, W, bh);
        h.fillStyle = "#101010";
        h.fillRect(0, y + bh - 3, W, 3);
      }
      grain(c, W, H, rnd, 10);
      break;
    }
  }
  return { color: cc, height: hc };
}

function drawFloor(finish: Exclude<FloorFinish, "plain">, hex: string): Painted {
  const [tw, th] = FLOOR_TILE[finish];
  const W = Math.round(tw * FLOOR_PX[finish]);
  const H = Math.round(th * FLOOR_PX[finish]);
  const [cc, c] = canvas(W, H);
  const [hc, h] = canvas(W, H);
  const base = new THREE.Color(hex);
  const rnd = rng(11);
  const sx = W / tw;
  const sy = H / th;
  h.fillStyle = "#c0c0c0";
  h.fillRect(0, 0, W, H);
  /** Boards running along u, `bw` wide, staggered lengths. */
  const boards = (bw: number, minL: number, maxL: number, light: number, grainLines: number) => {
    const rows = Math.round(th / bw);
    const bh = H / rows;
    for (let r = 0; r < rows; r++) {
      let x = rnd() * tw;
      let used = 0;
      while (used < tw - 0.05) {
        const len = Math.min(minL + rnd() * (maxL - minL), tw - used);
        const col = vary(base, rnd, light, 0.02);
        c.fillStyle = col;
        wrapRect(c, W, x * sx, r * bh, len * sx, bh);
        for (let g = 0; g < grainLines; g++) {
          c.strokeStyle = `rgba(60,30,10,${0.05 + rnd() * 0.08})`;
          c.lineWidth = 0.7 + rnd();
          const gy = r * bh + 2 + rnd() * (bh - 4);
          c.beginPath();
          const x0 = x * sx;
          const x1 = (x + len) * sx;
          c.moveTo(x0, gy);
          for (let px = x0; px <= x1; px += 24) c.lineTo(px, gy + Math.sin(px / 40 + g * 1.7) * 1.4);
          c.stroke();
          if (x1 > W) {
            c.beginPath();
            c.moveTo(x0 - W, gy);
            for (let px = x0 - W; px <= x1 - W; px += 24) c.lineTo(px, gy + Math.sin((px + W) / 40 + g * 1.7) * 1.4);
            c.stroke();
          }
        }
        // Butt joint at the board end.
        c.fillStyle = "rgba(40,25,10,0.45)";
        wrapRect(c, W, ((x + len) % tw) * sx - 1, r * bh, 2, bh);
        h.fillStyle = "#303030";
        wrapRect(h, W, ((x + len) % tw) * sx - 1, r * bh, 2, bh);
        x = (x + len) % tw;
        used += len;
      }
      c.fillStyle = "rgba(40,25,10,0.5)";
      c.fillRect(0, r * bh, W, 1.5);
      h.fillStyle = "#303030";
      h.fillRect(0, r * bh, W, 1.5);
    }
  };
  /** Grid of tiles or flags with grout joints. */
  const grid = (cols: number[], rows: number[], joint: number, light: number, grout: string) => {
    c.fillStyle = grout;
    c.fillRect(0, 0, W, H);
    h.fillStyle = "#303030";
    h.fillRect(0, 0, W, H);
    let y = 0;
    for (const rh of rows) {
      let x = 0;
      for (const cw of cols) {
        c.fillStyle = vary(base, rnd, light, 0.02);
        c.fillRect((x + joint / 2) * sx, (y + joint / 2) * sy, (cw - joint) * sx, (rh - joint) * sy);
        h.fillStyle = "#c8c8c8";
        h.fillRect((x + joint / 2) * sx, (y + joint / 2) * sy, (cw - joint) * sx, (rh - joint) * sy);
        x += cw;
      }
      y += rh;
    }
  };
  switch (finish) {
    case "oak":
      boards(0.15, 0.5, 1.6, 0.12, 5);
      grain(c, W, H, rnd, 10);
      break;
    case "laminate":
      boards(0.2, 1.2, 1.2, 0.07, 6);
      grain(c, W, H, rnd, 6);
      break;
    case "tile":
      grid([0.4, 0.4, 0.4], [0.4, 0.4, 0.4], 0.004, 0.04, "#b9b4aa");
      grain(c, W, H, rnd, 6);
      break;
    case "quarry": {
      // 150 mm clay tiles in dark joints; each firing comes out a little different.
      const q = Array<number>(6).fill(0.15);
      grid(q, q, 0.007, 0.1, "#4a3f3a");
      blotches(c, W, H, rnd, 50, 0.05, 8, 30);
      grain(c, W, H, rnd, 14);
      break;
    }
    case "stone": {
      // Random-length flags in two course heights, wrapped across the tile.
      c.fillStyle = "#8f887c";
      c.fillRect(0, 0, W, H);
      h.fillStyle = "#303030";
      h.fillRect(0, 0, W, H);
      const joint = 0.008;
      let y = 0;
      for (const rh of [0.6, 0.6]) {
        let x = rnd() * 0.4;
        let used = 0;
        while (used < tw - 0.05) {
          const len = Math.min(0.4 + Math.round(rnd() * 2) * 0.2, tw - used);
          c.fillStyle = vary(base, rnd, 0.16, 0.04);
          wrapRect(c, W, (x + joint / 2) * sx, (y + joint / 2) * sy, (len - joint) * sx, (rh - joint) * sy);
          h.fillStyle = "#c0c0c0";
          wrapRect(h, W, (x + joint / 2) * sx, (y + joint / 2) * sy, (len - joint) * sx, (rh - joint) * sy);
          x = (x + len) % tw;
          used += len;
        }
        y += rh;
      }
      blotches(c, W, H, rnd, 40, 0.06, 15, 60);
      grain(c, W, H, rnd, 18);
      break;
    }
    case "carpet":
      c.fillStyle = hex;
      c.fillRect(0, 0, W, H);
      grain(c, W, H, rnd, 34);
      grain(h, W, H, rnd, 80);
      break;
    case "vinyl": {
      // Tile-effect sheet: mottled 300 mm octagons with small darker diamonds where four meet.
      const s = 0.3 * sx;
      const cut = 0.036 * sx;
      const n = Math.round(tw / 0.3);
      c.fillStyle = css(tint(base, 0, 0.8, 0.55));
      c.fillRect(0, 0, W, H);
      h.fillStyle = "#404040";
      h.fillRect(0, 0, W, H);
      const octagon = (ctx: Ctx, x: number, y: number, inset: number) => {
        const k = cut + inset * 0.4;
        ctx.beginPath();
        ctx.moveTo(x + k, y + inset);
        ctx.lineTo(x + s - k, y + inset);
        ctx.lineTo(x + s - inset, y + k);
        ctx.lineTo(x + s - inset, y + s - k);
        ctx.lineTo(x + s - k, y + s - inset);
        ctx.lineTo(x + k, y + s - inset);
        ctx.lineTo(x + inset, y + s - k);
        ctx.lineTo(x + inset, y + k);
        ctx.closePath();
      };
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const x = i * s;
          const y = j * s;
          octagon(c, x, y, 1);
          c.save();
          c.clip();
          c.fillStyle = vary(base, rnd, 0.12, 0.02);
          c.fillRect(x, y, s, s);
          // Printed stone: clouds of lighter and darker tone within each tile.
          for (let b = 0; b < 7; b++) {
            const bx = x + rnd() * s;
            const by = y + rnd() * s;
            const r = s * (0.25 + rnd() * 0.4);
            const g = c.createRadialGradient(bx, by, 0, bx, by, r);
            g.addColorStop(0, rnd() > 0.5 ? "rgba(255,240,220,0.09)" : "rgba(60,30,10,0.1)");
            g.addColorStop(1, "rgba(0,0,0,0)");
            c.fillStyle = g;
            c.fillRect(bx - r, by - r, 2 * r, 2 * r);
          }
          c.restore();
          octagon(h, x, y, 1);
          h.fillStyle = "#c8c8c8";
          h.fill();
        }
      // Diamonds sit on the corners, so those on the edges are drawn on both sides of the seam.
      const dots = Array.from({ length: n * n }, () => vary(tint(base, -0.012, 1.35, 0.68), rnd, 0.08));
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n; j++) {
          const x = i * s;
          const y = j * s;
          const k = cut - 1;
          for (const [ctx, fill] of [
            [c, dots[(i % n) * n + (j % n)]],
            [h, "#a0a0a0"],
          ] as const) {
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.moveTo(x, y - k);
            ctx.lineTo(x + k, y);
            ctx.lineTo(x, y + k);
            ctx.lineTo(x - k, y);
            ctx.closePath();
            ctx.fill();
          }
        }
      grain(c, W, H, rnd, 10);
      break;
    }
    case "concrete":
      c.fillStyle = hex;
      c.fillRect(0, 0, W, H);
      blotches(c, W, H, rnd, 60, 0.06, 10, 80);
      grain(c, W, H, rnd, 18);
      grain(h, W, H, rnd, 40);
      break;
  }
  return { color: cc, height: hc };
}

function drawPlaster(): HTMLCanvasElement {
  const [cc, c] = canvas(256, 256);
  const rnd = rng(3);
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, 256, 256);
  blotches(c, 256, 256, rnd, 30, 0.025, 10, 60);
  grain(c, 256, 256, rnd, 6);
  return cc;
}

/** Draw at the nine offsets of a repeat, so motifs crossing an edge carry on from the opposite one. */
function wrapped(ctx: Ctx, w: number, h: number, draw: () => void) {
  for (const ox of [-w, 0, w])
    for (const oy of [-h, 0, h]) {
      ctx.save();
      ctx.translate(ox, oy);
      draw();
      ctx.restore();
    }
}

/** A pointed leaf or petal from (x, y) along angle a: length l, width wd. */
function blade(ctx: Ctx, x: number, y: number, a: number, l: number, wd: number) {
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  const px = -cy * wd;
  const py = cx * wd;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + cx * l * 0.45 + px, y + cy * l * 0.45 + py, x + cx * l, y + cy * l);
  ctx.quadraticCurveTo(x + cx * l * 0.45 - px, y + cy * l * 0.45 - py, x, y);
  ctx.closePath();
}

/** Wallpaper ground, tiles or brick with the pattern drawn over it. Wallpaper has no height map. */
function drawCover(p: Pattern, hex: string, accentHex: string | null): { color: HTMLCanvasElement; height: HTMLCanvasElement | null } {
  if (p === "brick") return drawWall("brick", hex, accentHex ?? undefined);
  const [tw, th] = coverTile(p, accentHex !== null);
  const W = Math.round(tw * COVER_PX[p]);
  const H = Math.round(th * COVER_PX[p]);
  const sx = W / tw;
  const sy = H / th;
  const [cc, c] = canvas(W, H);
  const base = new THREE.Color(hex);
  const accent = new THREE.Color(accentHex ?? hex);
  const rnd = rng(23);
  c.fillStyle = hex;
  c.fillRect(0, 0, W, H);
  /** Leaves and stems: the accent's hue, greyed and mid-toned so the flowers stand out. */
  const leaf = (dh: number, sat: number, light: number) => {
    const hsl = { h: 0, s: 0, l: 0 };
    accent.getHSL(hsl);
    return new THREE.Color().setHSL((hsl.h + dh + 1) % 1, Math.min(1, hsl.s * sat), light);
  };
  switch (p) {
    case "stripe": {
      // Regency stripe in widths (m) and tones (0 = ground, 1 = stripe colour), twice across the roll.
      const bands: [number, number][] = [
        [0.05, 0],
        [0.004, 1],
        [0.006, 0],
        [0.028, 0.6],
        [0.006, 0],
        [0.004, 1],
        [0.045, 0],
        [0.018, 0.85],
        [0.012, 0.3],
        [0.018, 0.85],
        [0.045, 0],
        [0.029, 0.2],
      ];
      const half = bands.reduce((s, [bw]) => s + bw, 0);
      let x = 0;
      for (let k = 0; k < 2; k++)
        for (const [bw, t] of bands) {
          c.fillStyle = css(base.clone().lerp(accent, t));
          c.fillRect(Math.round((x * tw) / (2 * half) * sx), 0, Math.ceil(((bw * tw) / (2 * half)) * sx), H);
          x += bw;
        }
      // A fine vertical slub, like the woven texture of the paper.
      for (let i = 0; i < W * 0.6; i++) {
        c.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.02)";
        const x = rnd() * W;
        const y = rnd() * H;
        const l = 10 + rnd() * 60;
        c.fillRect(x, y, 1, l);
        if (y + l > H) c.fillRect(x, y - H, 1, l);
      }
      grain(c, W, H, rnd, 5);
      return { color: cc, height: null };
    }
    case "floral": {
      // Large flowers in a half-drop, two across the roll, linked by trailing stems with leaves.
      const leafC = css(leaf(0, 0.08, 0.6));
      const veinC = css(leaf(0, 0.08, 0.48));
      const petal = accent;
      const dark = css(tint(petal, -0.01, 1.05, 0.62));
      const light = css(tint(petal, 0, 0.85, 1.25));
      const flowers: [number, number, number][] = [];
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 3; j++) {
          const x = 0.08 + i * (tw / 2);
          const y = (j + 0.5 * i) * (th / 3) + 0.05;
          flowers.push([x + (rnd() - 0.5) * 0.04, y + (rnd() - 0.5) * 0.04, 0.06 + rnd() * 0.02]);
          flowers.push([x + 0.13 + (rnd() - 0.5) * 0.04, y + 0.11 + (rnd() - 0.5) * 0.03, 0.028 + rnd() * 0.014]);
        }
      for (const f of flowers) {
        f[0] *= sx;
        f[1] *= sy;
        f[2] *= sx;
      }
      const stems: { x: number; y: number; a: number; l: number }[] = flowers.map(([x, y, r]) => ({
        x,
        y,
        a: Math.PI / 2 + (rnd() - 0.5) * 1.6,
        l: r * (2.4 + rnd() * 1.2),
      }));
      const leaves: [number, number, number, number][] = [];
      const curves: [number, number, number, number, number, number][] = [];
      for (const s of stems) {
        const ex = s.x + Math.cos(s.a) * s.l;
        const ey = s.y + Math.sin(s.a) * s.l;
        const bend = (rnd() - 0.5) * s.l * 0.8;
        const mx = (s.x + ex) / 2 - Math.sin(s.a) * bend;
        const my = (s.y + ey) / 2 + Math.cos(s.a) * bend;
        curves.push([s.x, s.y, mx, my, ex, ey]);
        for (const t of [0.35, 0.6, 0.85, 1]) {
          const u = 1 - t;
          const lx = u * u * s.x + 2 * u * t * mx + t * t * ex;
          const ly = u * u * s.y + 2 * u * t * my + t * t * ey;
          const tx = 2 * u * (mx - s.x) + 2 * t * (ex - mx);
          const ty = 2 * u * (my - s.y) + 2 * t * (ey - my);
          const side = t === 1 ? 0 : rnd() > 0.5 ? 1 : -1;
          leaves.push([lx, ly, Math.atan2(ty, tx) + side * (0.7 + rnd() * 0.4), 0.055 + rnd() * 0.03]);
        }
      }
      wrapped(c, W, H, () => {
        c.strokeStyle = leafC;
        c.lineWidth = 0.003 * sx;
        c.lineCap = "round";
        for (const [x0, y0, mx, my, ex, ey] of curves) {
          c.beginPath();
          c.moveTo(x0, y0);
          c.quadraticCurveTo(mx, my, ex, ey);
          c.stroke();
        }
        for (const [x, y, a, l] of leaves) {
          c.fillStyle = leafC;
          blade(c, x, y, a, l * sx, l * 0.32 * sx);
          c.fill();
          c.strokeStyle = veinC;
          c.lineWidth = 0.0012 * sx;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + Math.cos(a) * l * 0.85 * sx, y + Math.sin(a) * l * 0.85 * sx);
          c.stroke();
        }
        for (const [x, y, r] of flowers) {
          const n = 6;
          const turn = (x * 7.3 + y * 3.1) % (Math.PI * 2);
          for (const [scale, offset, fill] of [
            [1, 0, petal],
            [0.62, Math.PI / n, petal.clone().multiplyScalar(0.86)],
          ] as const) {
            for (let k = 0; k < n; k++) {
              const a = turn + offset + (k * Math.PI * 2) / n;
              const g = c.createRadialGradient(x, y, 0, x, y, r * scale);
              g.addColorStop(0, dark);
              g.addColorStop(0.45, css(fill));
              g.addColorStop(1, light);
              c.fillStyle = g;
              blade(c, x, y, a, r * scale, r * scale * 0.4);
              c.fill();
            }
          }
          c.fillStyle = dark;
          c.beginPath();
          c.arc(x, y, r * 0.16, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = light;
          for (let k = 0; k < 5; k++) {
            const a = turn + k * 1.26;
            c.beginPath();
            c.arc(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, r * 0.04, 0, Math.PI * 2);
            c.fill();
          }
        }
      });
      grain(c, W, H, rnd, 5);
      return { color: cc, height: null };
    }
    case "sprig": {
      // Small sprigs on a half-drop grid, four across the roll: a curved stem, a few leaves and buds.
      const leafC = css(leaf(0.06, 0.45, 0.62));
      const bud = css(accent);
      const budDark = css(tint(accent, 0, 1, 0.7));
      const cols = 4;
      const rows = 2;
      const motifs: { x: number; y: number; a: number; flip: number }[] = [];
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++)
          motifs.push({
            x: ((i + 0.5) / cols + (rnd() - 0.5) * 0.06) * W,
            y: ((j + 0.5 + (i % 2) * 0.5) / rows + (rnd() - 0.5) * 0.06) * H,
            a: -Math.PI / 2 + (rnd() - 0.5) * 0.9,
            flip: rnd() > 0.5 ? 1 : -1,
          });
      const L = 0.075 * sx;
      wrapped(c, W, H, () => {
        for (const m of motifs) {
          c.save();
          c.translate(m.x, m.y);
          c.rotate(m.a);
          c.scale(1, m.flip);
          // Local frame: the stem runs along +x from the origin, curving to +y.
          c.strokeStyle = leafC;
          c.lineWidth = 0.0014 * sx;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(-L / 2, 0);
          c.quadraticCurveTo(0, L * 0.25, L / 2, 0);
          c.stroke();
          c.fillStyle = leafC;
          for (const [t, side] of [
            [-0.3, 1],
            [-0.05, -1],
            [0.2, 1],
          ] as const) {
            const x = t * L;
            const y = L * 0.25 * (1 - (2 * t) ** 2) * 0.5;
            blade(c, x, y, side * 1.0 - 0.35, 0.022 * sx, 0.0065 * sx);
            c.fill();
          }
          for (const [bx, by, r] of [
            [L / 2, 0, 0.0055],
            [0.08 * L, 0.04 * L, 0.004],
            [0.36 * L, -0.14 * L, 0.0045],
          ]) {
            c.fillStyle = bud;
            c.beginPath();
            c.ellipse(bx, by, r * 1.35 * sx, r * sx, 0, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = budDark;
            c.beginPath();
            c.ellipse(bx - r * 0.5 * sx, by, r * 0.6 * sx, r * 0.55 * sx, 0, 0, Math.PI * 2);
            c.fill();
          }
          c.restore();
        }
      });
      grain(c, W, H, rnd, 5);
      return { color: cc, height: null };
    }
    case "rose": {
      // Large stylised roses, two to a roll in a half-drop, each set in a fine ring, on
      // trailing stems with big pointed leaves. Leaves and rings take a greyed hue across
      // the colour wheel from the flowers, so gold flowers sit among lilac-grey leaves.
      const hsl = { h: 0, s: 0, l: 0 };
      accent.getHSL(hsl);
      const leafCol = new THREE.Color().setHSL((hsl.h + 0.62) % 1, 0.12, 0.7);
      const leafC = css(leafCol);
      const lineC = css(tint(leafCol, 0, 1.2, 0.86));
      const veinC = css(base.clone().lerp(leafCol, 0.3));
      const dark = css(tint(accent, 0, 1.05, 0.8));
      const light = css(tint(accent, 0, 0.75, 1.22));
      const R = 0.085 * sx;
      const blooms = [
        [0.27 * W, 0.24 * H],
        [0.77 * W, 0.74 * H],
      ];
      // Each bloom sends stems out towards its neighbours, leafy along their length.
      const stems = blooms.flatMap(([x, y]) =>
        [-0.75, 0.45, 2.3, 3.6].map((a) => {
          const l = (0.17 + rnd() * 0.05) * sx;
          const ex = x + Math.cos(a) * l;
          const ey = y + Math.sin(a) * l;
          const bend = (rnd() > 0.5 ? 1 : -1) * l * 0.3;
          const mx = (x + ex) / 2 - Math.sin(a) * bend;
          const my = (y + ey) / 2 + Math.cos(a) * bend;
          const leaves = ([0.45, 0.75, 1] as const).map((t) => {
            const u = 1 - t;
            const turn = t === 1 ? 0 : t === 0.75 ? 0.8 : -0.8;
            const along = Math.atan2(2 * u * (my - y) + 2 * t * (ey - my), 2 * u * (mx - x) + 2 * t * (ex - mx));
            return { x: u * u * x + 2 * u * t * mx + t * t * ex, y: u * u * y + 2 * u * t * my + t * t * ey, a: along + turn, l: (0.1 + rnd() * 0.035) * sx };
          });
          return { curve: [x, y, mx, my, ex, ey], leaves };
        }),
      );
      // Stems and leaves everywhere first, then the blooms over them.
      wrapped(c, W, H, () => {
        c.lineCap = "round";
        for (const { curve, leaves } of stems) {
          const [x0, y0, mx, my, ex, ey] = curve;
          c.strokeStyle = lineC;
          c.lineWidth = 0.003 * sx;
          c.beginPath();
          c.moveTo(x0, y0);
          c.quadraticCurveTo(mx, my, ex, ey);
          c.stroke();
          for (const lf of leaves) {
            c.fillStyle = leafC;
            blade(c, lf.x, lf.y, lf.a, lf.l, lf.l * 0.3);
            c.fill();
            c.strokeStyle = veinC;
            c.lineWidth = 0.0018 * sx;
            c.beginPath();
            c.moveTo(lf.x, lf.y);
            c.lineTo(lf.x + Math.cos(lf.a) * lf.l * 0.8, lf.y + Math.sin(lf.a) * lf.l * 0.8);
            c.stroke();
          }
        }
      });
      wrapped(c, W, H, () => {
        for (const [x, y] of blooms) {
          // The ring is filled with the ground, so stems stop at it.
          c.fillStyle = css(base);
          c.strokeStyle = lineC;
          c.lineWidth = 0.0025 * sx;
          c.beginPath();
          c.arc(x, y, R * 1.5, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          // Outer petals, then a smaller darker ring of them, then the cupped heart.
          for (const [n, dist, pr, turn, from, to] of [
            [8, 0.6, 0.45, 0, light, css(accent)],
            [6, 0.33, 0.36, 0.4, css(accent), dark],
          ] as const) {
            for (let k = 0; k < n; k++) {
              const a = turn + (k * Math.PI * 2) / n;
              const px = x + Math.cos(a) * R * dist;
              const py = y + Math.sin(a) * R * dist;
              const g = c.createRadialGradient(px, py, 0, px, py, R * pr);
              g.addColorStop(0, from);
              g.addColorStop(1, to);
              c.fillStyle = g;
              c.strokeStyle = dark;
              c.lineWidth = 0.0012 * sx;
              c.beginPath();
              c.arc(px, py, R * pr, 0, Math.PI * 2);
              c.fill();
              c.stroke();
            }
          }
          c.fillStyle = dark;
          c.beginPath();
          c.arc(x, y, R * 0.2, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = light;
          c.lineWidth = 0.0015 * sx;
          for (let k = 0; k < 3; k++) {
            c.beginPath();
            c.arc(x, y, R * (0.08 + k * 0.05), k, k + 3.6);
            c.stroke();
          }
        }
      });
      grain(c, W, H, rnd, 5);
      return { color: cc, height: null };
    }
    case "trail": {
      // Trailing stems climbing the roll, three across in a half-drop, with long pointed
      // leaves either side and small buds on short stalks.
      const leafCol = leaf(0.08, 0.6, 0.66);
      const leafC = css(leafCol);
      const lineC = css(tint(leafCol, 0, 1.2, 0.76));
      const bud = css(accent);
      const budDark = css(tint(accent, 0, 1, 0.72));
      const A = 0.018 * sx;
      const nodes = 8;
      const stems = [0, 1, 2].map((i) => {
        const x0 = ((i + 0.5) / 3) * W;
        const phase = i * 2.1;
        // A whole number of waves per repeat, so stems run on from one repeat to the next.
        const xAt = (y: number) => x0 + A * Math.sin((2 * Math.PI * y) / H + phase);
        const leaves = Array.from({ length: nodes }, (_, k) => {
          const y = ((k + 0.5 * (i % 2)) / nodes) * H;
          const side = k % 2 ? 1 : -1;
          // Leaves sweep upwards and outwards; canvas y runs down the wall.
          return { x: xAt(y), y, side, a: -Math.PI / 2 + side * (0.75 + rnd() * 0.35), l: (0.06 + rnd() * 0.02) * sx, bud: k % 3 === 1 };
        });
        return { xAt, leaves };
      });
      wrapped(c, W, H, () => {
        c.lineCap = "round";
        for (const { xAt, leaves } of stems) {
          c.strokeStyle = lineC;
          c.lineWidth = 0.0016 * sx;
          c.beginPath();
          for (let y = 0; y <= H; y += H / 60) (y ? c.lineTo(xAt(y), y) : c.moveTo(xAt(y), y));
          c.stroke();
          for (const { x, y, side, a, l, bud: hasBud } of leaves) {
            c.fillStyle = leafC;
            blade(c, x, y, a, l, l * 0.24);
            c.fill();
            c.strokeStyle = lineC;
            c.lineWidth = 0.0009 * sx;
            c.stroke();
            if (!hasBud) continue;
            // A bud on a short curved stalk on the other side.
            const sa = -Math.PI / 2 - side * 0.9;
            const bx = x + Math.cos(sa) * 0.022 * sx;
            const by = y + Math.sin(sa) * 0.022 * sx;
            c.lineWidth = 0.0012 * sx;
            c.beginPath();
            c.moveTo(x, y);
            c.quadraticCurveTo(x + Math.cos(sa + 0.4) * 0.012 * sx, y + Math.sin(sa + 0.4) * 0.012 * sx, bx, by);
            c.stroke();
            c.fillStyle = bud;
            blade(c, bx, by, sa - side * 0.2, 0.019 * sx, 0.0075 * sx);
            c.fill();
            c.fillStyle = budDark;
            blade(c, bx, by, sa - side * 0.2, 0.009 * sx, 0.005 * sx);
            c.fill();
          }
        }
      });
      grain(c, W, H, rnd, 5);
      return { color: cc, height: null };
    }
    case "tiles": {
      // Portrait tiles in a stack bond with fine pale grout, and a column of small mosaics when a strip colour is set.
      const [hc, h] = canvas(W, H);
      const joint = 0.004;
      const grout = css(tint(base, 0, 0.35, 1.13));
      c.fillStyle = grout;
      c.fillRect(0, 0, W, H);
      h.fillStyle = "#303030";
      h.fillRect(0, 0, W, H);
      const cells: [number, number, number, number, string][] = [];
      const x0 = accentHex ? 2 * MOSAIC : 0;
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 3; j++) cells.push([x0 + i * WALL_TILE_W, j * WALL_TILE_H, WALL_TILE_W, WALL_TILE_H, vary(base, rnd, 0.035, 0.01)]);
      if (accentHex)
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < (3 * WALL_TILE_H) / MOSAIC; j++) cells.push([i * MOSAIC, j * MOSAIC, MOSAIC, MOSAIC, vary(accent, rnd, 0.22, 0.03)]);
      const cell = (ctx: Ctx, [x, y, cw, ch]: (typeof cells)[number]) =>
        ctx.fillRect((x + joint / 2) * sx, (y + joint / 2) * sy, (cw - joint) * sx, (ch - joint) * sy);
      for (const k of cells) {
        c.fillStyle = k[4];
        cell(c, k);
        h.fillStyle = "#c8c8c8";
        cell(h, k);
      }
      // Soft clouding printed on the glaze, then the joints again so they stay crisp.
      blotches(c, W, H, rnd, 50, 0.02, 30, 110);
      grain(c, W, H, rnd, 4);
      c.fillStyle = grout;
      const j = (joint / 2) * sx;
      for (const [x, y, cw, ch] of cells) {
        c.fillRect(x * sx - j, y * sy, 2 * j, ch * sy);
        c.fillRect(x * sx, y * sy - j, cw * sx, 2 * j);
      }
      c.fillRect(W - j, 0, j, H);
      c.fillRect(0, H - j, W, j);
      return { color: cc, height: hc };
    }
    case "squares": {
      // 1970s splashback: each tile's glaze pools cream in the middle and runs to the
      // edge colour at its borders, darkest in the corners, in dark grout.
      const [hc, h] = canvas(W, H);
      const joint = 0.003;
      const grout = css(tint(accent, 0, 0.55, 0.5));
      c.fillStyle = grout;
      c.fillRect(0, 0, W, H);
      h.fillStyle = "#303030";
      h.fillRect(0, 0, W, H);
      const steps = 14;
      const size = (SQUARE - joint) * sx;
      for (let i = 0; i < SQUARES; i++)
        for (let j = 0; j < SQUARES; j++) {
          const x = (i * SQUARE + joint / 2) * sx;
          const y = (j * SQUARE + joint / 2) * sy;
          const rim = (0.03 + rnd() * 0.022) * sx;
          const edge = accent.clone().lerp(base, 0.1 + rnd() * 0.25);
          const centre = new THREE.Color(vary(base, rnd, 0.04, 0.01));
          for (let k = 0; k <= steps; k++) {
            const f = k / steps;
            const inset = f * rim;
            // Eased so the colour falls off quickly from the rim and the middle stays clear.
            c.fillStyle = css(edge.clone().lerp(centre, 1 - (1 - f) ** 1.7));
            c.beginPath();
            c.roundRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset, inset * 1.6);
            c.fill();
            // Height: a slightly cushioned face, so the grout reads as a sunken joint.
            const hv = Math.round(150 + 60 * Math.min(1, f * 2));
            h.fillStyle = `rgb(${hv},${hv},${hv})`;
            h.beginPath();
            h.roundRect(x + inset * 0.3, y + inset * 0.3, size - 0.6 * inset, size - 0.6 * inset, inset * 0.5);
            h.fill();
          }
        }
      blotches(c, W, H, rnd, 40, 0.02, 20, 60);
      grain(c, W, H, rnd, 4);
      return { color: cc, height: hc };
    }
  }
}

function toTexture(img: HTMLCanvasElement, tile: [number, number], srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile[0], 1 / tile[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8; // three clamps this to what the GPU supports
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------------------------------------------------------------------------
// Materials

/** A material description; equal specs share one cached material. */
export type MatSpec =
  | { kind: "ext"; finish: WallFinish; color: string }
  | { kind: "paint"; color: string }
  | { kind: "cover"; covering: Pattern; color: string; accent: string | null }
  | { kind: "plain"; color: string; roughness?: number; metalness?: number }
  | { kind: "glass" }
  | { kind: "floor"; finish: FloorFinish; color: string; selected?: boolean };

export function matKey(s: MatSpec): string {
  switch (s.kind) {
    case "ext":
      return `ext|${s.finish}|${s.color}`;
    case "paint":
      return `paint|${s.color}`;
    case "cover":
      return `cover|${s.covering}|${s.color}|${s.accent ?? ""}`;
    case "plain":
      return `plain|${s.color}|${s.roughness ?? ""}|${s.metalness ?? ""}`;
    case "glass":
      return "glass";
    case "floor":
      return `floor|${s.finish}|${s.color}|${s.selected ? 1 : 0}`;
  }
}

const SELECTED = "#ffd166";
/**
 * Floors face up into the blue sky light and the bounce off the ceiling is missing, so a floor
 * painted in a warm beige comes out cool blue-grey (carpets in the listing's photos are oatmeal).
 * Multiplying the floor colour by this warm tint cancels most of that cast.
 */
const FLOOR_WARMTH = new THREE.Color("#ffecd2");
const heightMaps = new Map<string, THREE.CanvasTexture>();
const floorMaps = new Map<string, THREE.CanvasTexture>();
let plaster: THREE.CanvasTexture | null = null;
/** Materials by key, oldest first. Colour pickers can mint many, so the cache is capped. */
const materials = new Map<string, THREE.Material>();
const MAX_MATERIALS = 64;
/** Outside finishes and wall coverings each own a large canvas texture. */
const MAX_TEXTURED = 16;
const ownsMap = (key: string) => key.startsWith("ext|") || key.startsWith("cover|");

/** Height maps are seeded, so one per pattern serves every colour. */
function bumpFor(key: string, height: HTMLCanvasElement, tile: [number, number]) {
  let t = heightMaps.get(key);
  if (!t) {
    t = toTexture(height, tile, false);
    heightMaps.set(key, t);
  }
  return t;
}

const wallBump = (finish: WallFinish, painted: Painted) => bumpFor(finish, painted.height, WALL_TILE[finish]);

function create(s: MatSpec): THREE.Material {
  switch (s.kind) {
    case "ext": {
      const painted = drawWall(s.finish, s.color);
      return new THREE.MeshStandardMaterial({
        map: toTexture(painted.color, WALL_TILE[s.finish], true),
        bumpMap: s.finish === "render" ? null : wallBump(s.finish, painted),
        bumpScale: s.finish === "brick" ? 2 : 1.5,
        roughness: WALL_ROUGHNESS[s.finish],
      });
    }
    case "paint":
      plaster ??= toTexture(drawPlaster(), [2, 2], true);
      return new THREE.MeshStandardMaterial({ map: plaster, color: s.color, roughness: 0.92 });
    case "cover": {
      const strip = s.covering === "tiles" && s.accent !== null;
      const tile = coverTile(s.covering, strip);
      const painted = drawCover(s.covering, s.color, s.accent);
      // Inside brick shares the outside brick's height map.
      const bump = painted.height && bumpFor(s.covering === "brick" ? "brick" : `cover|${s.covering}|${strip}`, painted.height, tile);
      return new THREE.MeshStandardMaterial({
        map: toTexture(painted.color, tile, true),
        bumpMap: bump,
        bumpScale: s.covering === "brick" ? 2 : 1,
        roughness: COVER_ROUGHNESS[s.covering],
      });
    }
    case "plain":
      return new THREE.MeshStandardMaterial({ color: s.color, roughness: s.roughness ?? 0.8, metalness: s.metalness ?? 0 });
    case "glass":
      return new THREE.MeshPhysicalMaterial({
        color: "#a9cfe3",
        transparent: true,
        opacity: 0.38,
        roughness: 0.05,
        metalness: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    case "floor": {
      if (s.finish === "plain") return new THREE.MeshStandardMaterial({ color: s.selected ? SELECTED : new THREE.Color(s.color).multiply(FLOOR_WARMTH), roughness: 0.85 });
      // Colour maps are drawn per colour (grout and joints keep their own colour);
      // the pattern is seeded, so every colour shares one height map.
      const key = `${s.finish}|${s.color}`;
      let map = floorMaps.get(key);
      let bump = floorMaps.get(s.finish + "|h");
      if (!map || !bump) {
        const painted = drawFloor(s.finish, s.color);
        map = toTexture(painted.color, FLOOR_TILE[s.finish], true);
        floorMaps.set(key, map);
        if (!bump) {
          bump = toTexture(painted.height, FLOOR_TILE[s.finish], false);
          floorMaps.set(s.finish + "|h", bump);
        }
      }
      return new THREE.MeshStandardMaterial({
        map,
        bumpMap: bump,
        bumpScale: 1,
        color: s.selected ? SELECTED : FLOOR_WARMTH,
        roughness: FLOOR_ROUGHNESS[s.finish],
      });
    }
  }
}

/** The shared material for a spec (created on first use). */
export function getMaterial(s: MatSpec): THREE.Material {
  const key = matKey(s);
  let m = materials.get(key);
  if (m) {
    // Keep recently used materials at the young end of the cache.
    materials.delete(key);
    materials.set(key, m);
    return m;
  }
  m = create(s);
  materials.set(key, m);
  // Outside finishes and wall coverings own their colour map, and dragging a
  // colour picker makes one per step: keep only a few. Shared maps stay.
  for (const oldKey of overflow([...materials.keys()], MAX_MATERIALS, ownsMap, MAX_TEXTURED)) {
    const old = materials.get(oldKey)!;
    materials.delete(oldKey);
    if (ownsMap(oldKey)) (old as THREE.MeshStandardMaterial).map?.dispose();
    old.dispose();
  }
  return m;
}
