import * as THREE from "three";
import type { FloorFinish, WallFinish } from "../types";

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
  stone: "#b7ae9f",
  carpet: "#a39a8c",
  vinyl: "#d5d0c6",
  concrete: "#a9a8a3",
};
const FLOOR_ROUGHNESS: Record<Exclude<FloorFinish, "plain">, number> = {
  oak: 0.55,
  laminate: 0.5,
  tile: 0.3,
  stone: 0.75,
  carpet: 1,
  vinyl: 0.45,
  concrete: 0.85,
};
const WALL_ROUGHNESS: Record<WallFinish, number> = { brick: 0.95, render: 0.92, pebbledash: 1, stone: 0.95, cladding: 0.85 };

/** Default colour of interior paint (warm white). */
export const WARM_WHITE = "#f4f1ea";

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

function drawWall(finish: WallFinish, hex: string): Painted {
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
      const mortar = "#c9c3b6";
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
          c.fillStyle = vary(burnt ? base.clone().multiplyScalar(0.72) : base, rnd, 0.14, 0.03);
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
    case "vinyl":
      grid([0.3, 0.3, 0.3, 0.3], [0.3, 0.3, 0.3, 0.3], 0.002, 0.03, "#c4bfb5");
      blotches(c, W, H, rnd, 30, 0.03, 10, 50);
      break;
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
  | { kind: "plain"; color: string; roughness?: number; metalness?: number }
  | { kind: "glass" }
  | { kind: "floor"; finish: FloorFinish; color: string; selected?: boolean };

export function matKey(s: MatSpec): string {
  switch (s.kind) {
    case "ext":
      return `ext|${s.finish}|${s.color}`;
    case "paint":
      return `paint|${s.color}`;
    case "plain":
      return `plain|${s.color}|${s.roughness ?? ""}|${s.metalness ?? ""}`;
    case "glass":
      return "glass";
    case "floor":
      return `floor|${s.finish}|${s.color}|${s.selected ? 1 : 0}`;
  }
}

const SELECTED = "#ffd166";
const heightMaps = new Map<string, THREE.CanvasTexture>();
const floorMaps = new Map<string, THREE.CanvasTexture>();
let plaster: THREE.CanvasTexture | null = null;
/** Materials by key, oldest first. Colour pickers can mint many, so the cache is capped. */
const materials = new Map<string, THREE.Material>();
const MAX_MATERIALS = 64;

function wallBump(finish: WallFinish, painted: Painted) {
  let t = heightMaps.get(finish);
  if (!t) {
    t = toTexture(painted.height, WALL_TILE[finish], false);
    heightMaps.set(finish, t);
  }
  return t;
}

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
      if (s.finish === "plain") return new THREE.MeshStandardMaterial({ color: s.selected ? SELECTED : s.color, roughness: 0.85 });
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
        color: s.selected ? SELECTED : "#ffffff",
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
  if (materials.size > MAX_MATERIALS) {
    const [oldKey, old] = materials.entries().next().value!;
    materials.delete(oldKey);
    // Brick and other outside finishes own their colour map; shared maps stay.
    if (oldKey.startsWith("ext|")) (old as THREE.MeshStandardMaterial).map?.dispose();
    old.dispose();
  }
  return m;
}
