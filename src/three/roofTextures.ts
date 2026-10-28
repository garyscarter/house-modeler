import * as THREE from "three";
import type { TileStyle } from "../types";
import { canvas } from "./textures";
import { normalFromHeight } from "./normalMaps";

/** A colour map (near white, tinted by the material colour) and a normal map from the painted height, repeating every `size` metres. */
export interface RoofTexture {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  /** How strongly the normal map shows (material `normalScale`): clay and concrete tiles 1.4, thin slates 0.7, so the courses read as strongly as the old bump map's. */
  normalScale: number;
  roughness: number;
}

const cache = new Map<TileStyle, RoofTexture>();
const plain = new Map<string, THREE.CanvasTexture>();

/** Small seeded generator so the pattern is the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function texture(c: HTMLCanvasElement, sizeM: [number, number], color: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / sizeM[0], 1 / sizeM[1]);
  t.anisotropy = 16;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const grey = (v: number) => {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${g},${g},${g})`;
};
const rgb = (r: number, g: number, b: number) =>
  `rgb(${Math.round(Math.min(1, r) * 255)},${Math.round(Math.min(1, g) * 255)},${Math.round(Math.min(1, b) * 255)})`;

/** Draw a rectangle wrapping around the canvas edges horizontally. */
function wrapRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, W: number) {
  ctx.fillRect(x, y, w, h);
  if (x + w > W) ctx.fillRect(x - W, y, w, h);
  if (x < 0) ctx.fillRect(x + W, y, w, h);
}

interface Layout {
  /** Units across and courses up per texture repeat. */
  across: number;
  courses: number;
  /** World size of one repeat, metres. */
  size: [number, number];
  /** Offset alternate courses by half a unit. */
  stagger: boolean;
  /** Shadow under the course above (px) and the strength of the colour variation. */
  shadow: number;
  vary: number;
  roughness: number;
  normalScale: number;
  /** Optional brightness profile across one unit (0..1 -> multiplier), for tile rolls. */
  profile?: (x: number) => number;
  /** Width jitter of individual units (slates are not all the same width). */
  jitter?: number;
  /** Direction of the per-unit colour shift (warmer or cooler), per channel. */
  hue: [number, number, number];
}

const LAYOUTS: Record<TileStyle, Layout> = {
  // 265 x 165 mm plain clay tiles at a 100 mm gauge, broken bond.
  plain: { across: 6, courses: 8, size: [0.99, 0.8], stagger: true, shadow: 9, vary: 0.2, roughness: 0.85, normalScale: 1.4, hue: [0.07, 0.01, -0.05] },
  // Double roman style concrete tiles: 300 mm cover, 340 mm gauge, straight bond with two rolls each.
  concrete: {
    across: 4,
    courses: 3,
    size: [1.2, 1.02],
    stagger: false,
    shadow: 16,
    vary: 0.08,
    roughness: 0.9,
    normalScale: 1.4,
    hue: [0.03, 0.01, -0.02],
    profile: (x) => {
      const roll = (c: number, w: number) => Math.max(0, 1 - ((x - c) / w) ** 2);
      return 0.8 + 0.3 * roll(0.22, 0.13) + 0.18 * roll(0.7, 0.08) - 0.12 * roll(0.46, 0.06) - 0.12 * roll(0.97, 0.05);
    },
  },
  // 500 x 250 mm natural slates at about a 200 mm gauge.
  slate: { across: 4, courses: 6, size: [1.0, 1.2], stagger: true, shadow: 4, vary: 0.28, roughness: 0.62, normalScale: 0.7, jitter: 0.12, hue: [-0.03, -0.01, 0.05] },
};

/** Tiles or slates, cached per style. Courses run along u; v increases up the slope. */
export function tileTextures(style: TileStyle): RoofTexture {
  const hit = cache.get(style);
  if (hit) return hit;
  const L = LAYOUTS[style];
  const S = 512;
  const [colC, colCtx] = canvas(S, S);
  const [bmpC, bmpCtx] = canvas(S, S);
  const rand = rng(style.length * 977 + 13);
  const unitW = S / L.across;
  const courseH = S / L.courses;
  for (let c = 0; c < L.courses; c++) {
    const y0 = c * courseH;
    const offset = L.stagger && c % 2 ? unitW / 2 : 0;
    let x = offset;
    for (let k = 0; k < L.across; k++) {
      // Slates vary in width; the last one closes the course so it still tiles.
      const w = k === L.across - 1 ? offset + S - x : unitW * (1 + (L.jitter ? (rand() - 0.5) * 2 * L.jitter : 0));
      const b = 1 - L.vary + rand() * L.vary;
      const shift = (rand() - 0.5) * 2;
      const [hr, hg, hb] = L.hue.map((h) => 1 + shift * h);
      if (L.profile) {
        for (let px = 0; px < w; px++) {
          const p = L.profile(px / w);
          colCtx.fillStyle = rgb(b * p * hr, b * p * hg, b * p * hb);
          wrapRect(colCtx, x + px, y0, 1, courseH, S);
          bmpCtx.fillStyle = grey(0.35 + 0.5 * (p - 0.7));
          wrapRect(bmpCtx, x + px, y0, 1, courseH, S);
        }
      } else {
        colCtx.fillStyle = rgb(b * hr, b * hg, b * hb);
        wrapRect(colCtx, x, y0, w, courseH, S);
        bmpCtx.fillStyle = grey(0.55);
        wrapRect(bmpCtx, x, y0, w, courseH, S);
      }
      // Each unit gets a little lighter towards its exposed lower edge.
      const grad = colCtx.createLinearGradient(0, y0, 0, y0 + courseH);
      grad.addColorStop(0, "rgba(0,0,0,0.18)");
      grad.addColorStop(0.5, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(255,255,255,0.06)");
      colCtx.fillStyle = grad;
      wrapRect(colCtx, x, y0, w, courseH, S);
      const bgrad = bmpCtx.createLinearGradient(0, y0, 0, y0 + courseH);
      bgrad.addColorStop(0, "rgba(0,0,0,0.5)");
      bgrad.addColorStop(1, "rgba(255,255,255,0.35)");
      bmpCtx.fillStyle = bgrad;
      wrapRect(bmpCtx, x, y0, w, courseH, S);
      // Joint between units.
      colCtx.fillStyle = "rgba(20,12,8,0.55)";
      wrapRect(colCtx, x, y0, 2, courseH, S);
      bmpCtx.fillStyle = grey(0.05);
      wrapRect(bmpCtx, x, y0, 2, courseH, S);
      x += w;
    }
    // Shadow cast by the leading edge of the course above, and that edge's highlight.
    const sh = colCtx.createLinearGradient(0, y0, 0, y0 + L.shadow);
    sh.addColorStop(0, "rgba(10,6,4,0.75)");
    sh.addColorStop(1, "rgba(10,6,4,0)");
    colCtx.fillStyle = sh;
    colCtx.fillRect(0, y0, S, L.shadow);
    colCtx.fillStyle = "rgba(255,255,255,0.12)";
    colCtx.fillRect(0, y0 + courseH - 2, S, 2);
    bmpCtx.fillStyle = grey(0.95);
    bmpCtx.fillRect(0, y0 + courseH - 3, S, 3);
    bmpCtx.fillStyle = grey(0.0);
    bmpCtx.fillRect(0, y0, S, 2);
  }
  // Fine grain and a little weathering.
  for (let i = 0; i < 9000; i++) {
    const a = rand() * 0.12;
    colCtx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.7})`;
    colCtx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  for (let i = 0; i < 14; i++) {
    const r = 10 + rand() * 30;
    const g = colCtx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, "rgba(40,45,20,0.10)");
    g.addColorStop(1, "rgba(40,45,20,0)");
    colCtx.save();
    colCtx.translate(rand() * S, rand() * S);
    colCtx.fillStyle = g;
    colCtx.fillRect(-r, -r, 2 * r, 2 * r);
    colCtx.restore();
  }
  const out = { map: texture(colC, L.size, true), normal: normalFromHeight(`roof|${style}`, bmpC, L.size), normalScale: L.normalScale, roughness: L.roughness };
  cache.set(style, out);
  return out;
}

/** Fine-grained flat roof membrane (repeats every metre). */
export function membraneTexture(): THREE.CanvasTexture {
  const hit = plain.get("membrane");
  if (hit) return hit;
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rand = rng(7);
  ctx.fillStyle = grey(0.9);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = grey(0.72 + rand() * 0.28);
    ctx.fillRect(Math.floor(rand() * S), Math.floor(rand() * S), 1, 1);
  }
  const map = texture(c, [1, 1], true);
  plain.set("membrane", map);
  return map;
}

/** Stretcher-bond brickwork: 215 x 65 mm bricks with 10 mm joints (repeats every 0.9 x 0.6 m). */
export function brickTexture(): THREE.CanvasTexture {
  const hit = plain.get("brick");
  if (hit) return hit;
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rand = rng(11);
  ctx.fillStyle = "rgb(186,176,160)";
  ctx.fillRect(0, 0, S, S);
  const bw = S / 4;
  const ch = S / 8;
  const joint = Math.max(1, Math.round((0.01 / 0.075) * ch));
  for (let r = 0; r < 8; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let k = 0; k < 5; k++) {
      const v = 0.82 + rand() * 0.3;
      ctx.fillStyle = rgb((0.6 + rand() * 0.06) * v, (0.29 + rand() * 0.04) * v, (0.21 + rand() * 0.03) * v);
      wrapRect(ctx, k * bw + off - bw, r * ch + joint, bw - joint, ch - joint, S);
    }
  }
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.15})`;
    ctx.fillRect(rand() * S, rand() * S, 1, 1);
  }
  const map = texture(c, [0.9, 0.6], true);
  plain.set("brick", map);
  return map;
}
