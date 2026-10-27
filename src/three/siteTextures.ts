import * as THREE from "three";
import type { SurfaceFinish, SurfaceKind } from "../types";
import { rng } from "./textures";

/**
 * Procedural textures for the garden, boundaries and street, drawn once on
 * a canvas and shared by every viewer. Each covers `metres` of ground, so a
 * geometry with UVs in metres sets repeat to 1 / metres.
 */
export type TextureKind = SurfaceKind | SurfaceFinish | "ground" | "fence" | "brick" | "hedge" | "screen" | "sleeper" | "paving" | "corten" | "render" | "brick-top" | "brick-coping";

export interface SiteTexture {
  map: THREE.Texture;
  /** Size of one tile in metres. */
  metres: number;
}

const SIZE = 512;
/** Tile size of the brick-top textures; Site.tsx scales the kerb top's v to match. */
export const BRICK_TOP_METRES = 0.9;
const cache = new Map<TextureKind, SiteTexture>();

/** Small deterministic PRNG so textures look the same on every load. */
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

/** Fine speckle so flat areas don't look like plastic. */
function speckle(g: CanvasRenderingContext2D, r: () => number, n: number, light: number, dark: number, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${light * r()})` : `rgba(0,0,0,${dark * r()})`;
    g.fillRect(r() * SIZE, r() * SIZE, size, size);
  }
}

/** A grid of slabs with mortar joints and per-slab tone variation. */
function slabs(g: CanvasRenderingContext2D, r: () => number, cols: number, rows: number, hue: number, sat: number, light: number, joint: string, stagger = 0) {
  g.fillStyle = joint;
  g.fillRect(0, 0, SIZE, SIZE);
  const w = SIZE / cols;
  const h = SIZE / rows;
  const gap = 3;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * stagger * w;
    for (let i = -1; i < cols + 1; i++) {
      g.fillStyle = hsl(hue + (r() - 0.5) * 6, sat + (r() - 0.5) * 6, light + (r() - 0.5) * 7);
      g.fillRect(i * w + off + gap / 2, j * h + gap / 2, w - gap, h - gap);
    }
  }
}

/** Rectangular blocks in stretcher bond, each filled by `colour()`, with `gap` pixels of joint between them. */
function blockPaving(g: CanvasRenderingContext2D, joint: string, cols: number, rows: number, colour: () => string, gap: number, rr: () => number) {
  g.fillStyle = joint;
  g.fillRect(0, 0, SIZE, SIZE);
  const w = SIZE / cols;
  const h = SIZE / rows;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * (w / 2);
    for (let i = -1; i < cols + 1; i++) {
      const x = i * w + off + gap / 2;
      const y = j * h + gap / 2;
      const bw = w - gap;
      const bh = h - gap;
      g.fillStyle = colour();
      g.fillRect(x, y, bw, bh);
      // Soft brindle inside the block, then a 1 px bevel catching light on top and left.
      g.save();
      g.beginPath();
      g.rect(x, y, bw, bh);
      g.clip();
      const nb = 2 + Math.floor(rr() * 2);
      for (let k = 0; k < nb; k++) {
        g.fillStyle = rr() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
        g.beginPath();
        g.ellipse(x + rr() * bw, y + rr() * bh, bw * (0.2 + rr() * 0.25), bh * (0.25 + rr() * 0.3), rr() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      g.fillStyle = "rgba(255,255,255,0.10)";
      g.fillRect(x, y, bw, 1);
      g.fillRect(x, y, 1, bh);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(x, y + bh - 1, bw, 1);
      g.fillRect(x + bw - 1, y, 1, bh);
    }
  }
}

function draw(kind: TextureKind): { canvas: HTMLCanvasElement; metres: number } {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  // The finishes that stand in for a kind's usual look share its seed, so they draw the same texture.
  const seedKind = kind === "block-mixed" ? "drive" : kind === "slabs" ? "patio" : kind;
  const r = rng(seedKind.length * 7919 + seedKind.charCodeAt(0));
  let metres = 2;
  switch (kind) {
    case "lawn":
    case "ground": {
      const ground = kind === "ground";
      g.fillStyle = ground ? hsl(88, 14, 60) : hsl(95, 26, 31);
      g.fillRect(0, 0, SIZE, SIZE);
      if (!ground) {
        // Mowing stripes: alternate 0.5 m bands (one stripe per tile half, the tile being 2 m of lawn in four bands).
        for (let i = 0; i < 2; i++) {
          g.fillStyle = "rgba(255,255,255,0.05)";
          g.fillRect(0, i * (SIZE / 2), SIZE, SIZE / 4);
        }
        // A few faint dry patches.
        for (let i = 0; i < 8; i++) {
          g.fillStyle = "rgba(150,140,80,0.06)";
          g.beginPath();
          g.ellipse(r() * SIZE, r() * SIZE, 30 + r() * 50, 20 + r() * 40, r() * Math.PI, 0, Math.PI * 2);
          g.fill();
        }
      }
      const blades = ground ? 9000 : 16000;
      for (let i = 0; i < blades; i++) {
        const x = r() * SIZE;
        const y = r() * SIZE;
        g.strokeStyle = ground ? hsl(78 + r() * 25, 12 + r() * 10, 50 + r() * 22, 0.55) : hsl(70 + r() * 45, 20 + r() * 22, 22 + r() * 26, 0.6);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        const len = ground ? 2 + r() * 4 : 3 + r() * 4;
        g.lineTo(x + (r() - 0.5) * 3, y - len);
        g.stroke();
      }
      metres = ground ? 4 : 2;
      break;
    }
    case "patio":
    case "slabs":
      slabs(g, r, 3, 3, 38, 26, 72, "#9b917f");
      speckle(g, r, 6000, 0.25, 0.2);
      metres = 1.8;
      break;
    case "path":
      slabs(g, r, 2, 4, 35, 12, 70, "#8e877c", 0.5);
      speckle(g, r, 5000, 0.2, 0.2);
      metres = 0.9;
      break;
    case "pavement":
      slabs(g, r, 3, 3, 210, 4, 66, "#8a8c8f");
      speckle(g, r, 7000, 0.15, 0.22);
      metres = 1.8;
      break;
    case "drive":
    case "block-mixed": {
      // Block paving, 200 x 100 mm in stretcher bond, brindle colours.
      blockPaving(g, "#5e544b", 6, 12, () => (r() < 0.6 ? hsl(14 + r() * 8, 30 + r() * 15, 42 + r() * 10) : hsl(30, 8 + r() * 6, 40 + r() * 12)), 3, r);
      speckle(g, r, 4000, 0.15, 0.2);
      metres = 1.2;
      break;
    }
    case "block-weathered": {
      // Small 200 x 100 mm blocks, long weathered: mostly charcoal and slate with some faded red,
      // darkened and mottled by moss, oil and wear, in dirty joints (rear-garden, rear-4).
      blockPaving(
        g,
        "#2f2c2a",
        8,
        16,
        () => {
          const v = r();
          if (v < 0.34) return hsl(10 + r() * 8, 18 + r() * 12, 38 + r() * 9);
          if (v < 0.5) return hsl(14 + r() * 8, 14 + r() * 8, 29 + r() * 7);
          return hsl(25 + r() * 20, 3 + r() * 5, 33 + r() * 11);
        },
        2,
        r,
      );
      for (let i = 0; i < 70; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(70,80,50,${0.05 + r() * 0.07})` : `rgba(0,0,0,${0.06 + r() * 0.08})`;
        g.beginPath();
        g.ellipse(r() * SIZE, r() * SIZE, 14 + r() * 36, 8 + r() * 22, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      speckle(g, r, 5000, 0.1, 0.25);
      metres = 1.2;
      break;
    }
    case "tarmac": {
      // Asphalt: dark grey with a fine pale aggregate and the odd darker patch.
      g.fillStyle = "#4b4c4f";
      g.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.07})`;
        g.fillRect(r() * SIZE, r() * SIZE, 50 + r() * 140, 40 + r() * 100);
      }
      speckle(g, r, 28000, 0.2, 0.3, 2);
      metres = 3;
      break;
    }
    case "gravel": {
      // Pea shingle: small rounded stones in buff, grey and brown.
      g.fillStyle = "#8d8472";
      g.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 4200; i++) {
        g.fillStyle = hsl(32 + r() * 14, 6 + r() * 14, 40 + r() * 32);
        g.beginPath();
        g.ellipse(r() * SIZE, r() * SIZE, 2 + r() * 3.5, 1.5 + r() * 2.5, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      speckle(g, r, 3000, 0.1, 0.35);
      metres = 1;
      break;
    }
    case "bed": {
      g.fillStyle = hsl(24, 24, 18);
      g.fillRect(0, 0, SIZE, SIZE);
      // Clods and bark mulch.
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.25)" : "rgba(120,95,70,0.25)";
        g.beginPath();
        g.ellipse(r() * SIZE, r() * SIZE, 1 + r() * 1.5, 1 + r() * 1.5, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = hsl(25, 35, 30 + r() * 8);
        g.beginPath();
        g.ellipse(r() * SIZE, r() * SIZE, 2, 0.75, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      // Low planting seen from above: each clump throws a soft shadow, its leaves lit on the upper left.
      for (let i = 0; i < 45; i++) {
        const x = r() * SIZE;
        const y = r() * SIZE;
        const rad = 10 + r() * 30;
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.beginPath();
        g.ellipse(x + 4, y + 4, rad * 1.1, rad * 1.1, 0, 0, Math.PI * 2);
        g.fill();
        const hue = 85 + r() * 50;
        const leaves = 18 + Math.floor(r() * 9);
        for (let k = 0; k < leaves; k++) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * rad * 0.8;
          const lx = x + Math.cos(a) * d;
          const ly = y + Math.sin(a) * d;
          const lit = lx - x + (ly - y) < -rad * 0.15 ? 8 : 0;
          g.fillStyle = hsl(hue + (r() - 0.5) * 10, 25 + r() * 20, 20 + r() * 14 + lit);
          g.beginPath();
          g.ellipse(lx, ly, 4 + r() * 5, 3 + r() * 3, r() * Math.PI, 0, Math.PI * 2);
          g.fill();
        }
        if (i % 8 === 0) {
          const fh = [330, 45, 275][Math.floor(r() * 3)];
          const dots = 6 + Math.floor(r() * 7);
          for (let k = 0; k < dots; k++) {
            g.fillStyle = hsl(fh, 60, 62);
            g.beginPath();
            g.arc(x + (r() - 0.5) * rad, y + (r() - 0.5) * rad, 1 + r(), 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      metres = 2.5;
      break;
    }
    case "road": {
      g.fillStyle = "#4a4c50";
      g.fillRect(0, 0, SIZE, SIZE);
      speckle(g, r, 30000, 0.18, 0.35, 2);
      // A few faint patches of repair.
      for (let i = 0; i < 3; i++) {
        g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.06})`;
        g.fillRect(r() * SIZE, r() * SIZE, 60 + r() * 120, 40 + r() * 80);
      }
      metres = 4;
      break;
    }
    case "fence": {
      // Vertical feather-edge boards, 100 mm wide.
      const n = 10;
      const w = SIZE / n;
      for (let i = 0; i < n; i++) {
        const l = 34 + r() * 8;
        const grad = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
        grad.addColorStop(0, hsl(28, 32, l - 6));
        grad.addColorStop(0.85, hsl(28, 32, l));
        grad.addColorStop(1, hsl(28, 30, l - 12));
        g.fillStyle = grad;
        g.fillRect(i * w, 0, w, SIZE);
        // Grain.
        for (let k = 0; k < 40; k++) {
          g.strokeStyle = `rgba(40,25,10,${0.08 + r() * 0.1})`;
          g.beginPath();
          const x = i * w + r() * w;
          g.moveTo(x, 0);
          g.lineTo(x + (r() - 0.5) * 4, SIZE);
          g.stroke();
        }
      }
      metres = 1;
      break;
    }
    case "brick-top":
    case "brick-coping": {
      // The top of a brick kerb: one course across the tile (v spans the strip's width), 215 x 102.5 mm bricks
      // laid along it with 10 mm joints; the coping lays them on edge as 75 mm headers across.
      g.fillStyle = "#8a7f6e";
      g.fillRect(0, 0, SIZE, SIZE);
      const cols = kind === "brick-top" ? 4 : 12;
      const w = SIZE / cols;
      const joint = kind === "brick-top" ? (10 / 225) * w : (10 / 75) * w;
      const vj = (10 / 102.5) * SIZE * 0.5;
      for (let i = 0; i < cols; i++) {
        g.fillStyle = hsl(12 + r() * 10, 38 + r() * 14, 32 + r() * 12);
        g.fillRect(i * w + joint / 2, vj / 2, w - joint, SIZE - vj);
      }
      speckle(g, r, 4000, 0.1, 0.2);
      metres = BRICK_TOP_METRES;
      break;
    }
    case "brick": {
      // 215 x 65 mm bricks with 10 mm joints: 4 bricks and 12 courses per 0.9 m tile.
      g.fillStyle = "#b8ad9c";
      g.fillRect(0, 0, SIZE, SIZE);
      const cols = 4;
      const rows = 12;
      const w = SIZE / cols;
      const h = SIZE / rows;
      const joint = (10 / 225) * w;
      for (let j = 0; j < rows; j++) {
        const off = (j % 2) * (w / 2);
        for (let i = -1; i < cols + 1; i++) {
          g.fillStyle = hsl(12 + r() * 10, 40 + r() * 15, 36 + r() * 12);
          g.fillRect(i * w + off + joint / 2, j * h + joint / 2, w - joint, h - joint);
        }
      }
      speckle(g, r, 5000, 0.12, 0.2);
      metres = 0.9;
      break;
    }
    case "screen": {
      // One pierced concrete screen block per tile: a weathered grey square with a thin joint round it, a
      // bar across each diagonal and four leaf-shaped holes between the bars (alpha 0, so the wall is
      // see-through there and casts a pierced shadow).
      g.clearRect(0, 0, SIZE, SIZE);
      const joint = 7;
      g.fillStyle = hsl(40, 6, 70);
      g.fillRect(joint, joint, SIZE - 2 * joint, SIZE - 2 * joint);
      speckle(g, r, 3500, 0.1, 0.16, 3);
      g.fillStyle = hsl(40, 5, 58);
      g.fillRect(0, 0, SIZE, joint);
      g.fillRect(0, SIZE - joint, SIZE, joint);
      g.fillRect(0, 0, joint, SIZE);
      g.fillRect(SIZE - joint, 0, joint, SIZE);
      g.save();
      g.globalCompositeOperation = "destination-out";
      for (const [cx, cy, rx, ry] of [
        [SIZE / 2, SIZE * 0.3, SIZE * 0.25, SIZE * 0.13],
        [SIZE / 2, SIZE * 0.7, SIZE * 0.25, SIZE * 0.13],
        [SIZE * 0.3, SIZE / 2, SIZE * 0.13, SIZE * 0.25],
        [SIZE * 0.7, SIZE / 2, SIZE * 0.13, SIZE * 0.25],
      ]) {
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // The diagonal bars, painted back over the holes so each hole ends in a leaf's point.
      g.fillStyle = hsl(40, 6, 66);
      for (const a of [Math.PI / 4, -Math.PI / 4]) {
        g.save();
        g.translate(SIZE / 2, SIZE / 2);
        g.rotate(a);
        g.fillRect(-SIZE, -SIZE * 0.045, SIZE * 2, SIZE * 0.09);
        g.restore();
      }
      metres = 0.29;
      break;
    }
    case "sleeper": {
      // Railway-style timber sleepers laid on edge, 200 mm courses, joints staggered every 1.2 m.
      const rows = 6;
      const h = SIZE / rows;
      for (let j = 0; j < rows; j++) {
        const l = 26 + r() * 8;
        g.fillStyle = hsl(26, 28, l);
        g.fillRect(0, j * h, SIZE, h);
        // Grain and cracks along the sleeper.
        for (let k = 0; k < 26; k++) {
          g.strokeStyle = r() < 0.7 ? `rgba(30,18,8,${0.1 + r() * 0.2})` : `rgba(255,235,210,${0.05 + r() * 0.06})`;
          g.lineWidth = 1 + r() * 1.5;
          g.beginPath();
          const y = j * h + 4 + r() * (h - 8);
          const x0 = r() * SIZE;
          g.moveTo(x0, y);
          g.lineTo(x0 + 60 + r() * 200, y + (r() - 0.5) * 3);
          g.stroke();
        }
        // Gap between courses and a butt joint, alternate rows offset.
        g.fillStyle = "rgba(15,10,6,0.75)";
        g.fillRect(0, j * h, SIZE, 3);
        g.fillRect(((j % 2) * SIZE) / 2, j * h, 4, h);
      }
      speckle(g, r, 2500, 0.06, 0.15);
      metres = 1.2;
      break;
    }
    case "corten": {
      // Weathering steel: rust orange-brown in soft blotches and streaks.
      g.fillStyle = hsl(20, 58, 30);
      g.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = hsl(14 + r() * 16, 50 + r() * 25, 22 + r() * 18, 0.25);
        g.beginPath();
        g.ellipse(r() * SIZE, r() * SIZE, 10 + r() * 40, 6 + r() * 24, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(40,18,8,${0.08 + r() * 0.1})`;
        g.fillRect(r() * SIZE, r() * SIZE, 2 + r() * 3, 30 + r() * 120);
      }
      speckle(g, r, 6000, 0.08, 0.2);
      metres = 1;
      break;
    }
    case "paving": {
      // The patio's own weathered 200 x 60 mm block pavers (block-weathered colours) lifted and re-laid on
      // their sides in stretcher bond, 60 mm courses with thin sandy joints: a border built from the patio
      // that came up for the lawn. 3 blocks by 10 courses per 0.6 m tile.
      const cols = 3;
      const rows = 10;
      const w = SIZE / cols;
      const h = SIZE / rows;
      g.fillStyle = "#8d8373";
      g.fillRect(0, 0, SIZE, SIZE);
      const gap = 3;
      for (let j = 0; j < rows; j++) {
        const off = (j % 2) * (w / 2);
        for (let i = -1; i < cols + 1; i++) {
          const v = r();
          g.fillStyle = v < 0.34 ? hsl(10 + r() * 8, 26 + r() * 12, 38 + r() * 9) : v < 0.5 ? hsl(14 + r() * 8, 14 + r() * 8, 29 + r() * 7) : hsl(25 + r() * 20, 3 + r() * 5, 33 + r() * 11);
          g.fillRect(i * w + off + gap / 2, j * h + gap / 2, w - gap, h - gap);
          g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
          g.beginPath();
          g.ellipse(i * w + off + w * r(), j * h + h * r(), w * 0.3, h * 0.3, r() * Math.PI, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "rgba(255,255,255,0.10)";
          g.fillRect(i * w + off + gap / 2, j * h + gap / 2, w - gap, 1);
          g.fillStyle = "rgba(0,0,0,0.18)";
          g.fillRect(i * w + off + gap / 2, (j + 1) * h - gap / 2 - 1, w - gap, 1);
        }
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(70,80,40,${0.08 + r() * 0.12})`;
        g.beginPath();
        g.ellipse(r() * SIZE, r() * SIZE, 6 + r() * 18, 4 + r() * 10, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      speckle(g, r, 5000, 0.1, 0.22);
      metres = 0.6;
      break;
    }
    case "render": {
      // Pale rendered blockwork: off-white with a fine sand texture and faint patches.
      g.fillStyle = hsl(42, 18, 86);
      g.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(120,110,90,${0.02 + r() * 0.04})`;
        g.beginPath();
        g.ellipse(r() * SIZE, r() * SIZE, 20 + r() * 70, 15 + r() * 50, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      speckle(g, r, 9000, 0.12, 0.1);
      metres = 2;
      break;
    }
    case "hedge": {
      g.fillStyle = hsl(105, 35, 18);
      g.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = hsl(85 + r() * 40, 30 + r() * 25, 18 + r() * 22, 0.85);
        g.beginPath();
        g.ellipse(r() * SIZE, r() * SIZE, 3 + r() * 6, 2 + r() * 4, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      metres = 1;
      break;
    }
  }
  return { canvas, metres };
}

/** The shared texture for a surface or boundary material. */
export function siteTexture(kind: TextureKind): SiteTexture {
  let t = cache.get(kind);
  if (!t) {
    const { canvas, metres } = draw(kind);
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.repeat.set(1 / metres, 1 / metres);
    t = { map, metres };
    cache.set(kind, t);
  }
  return t;
}

/**
 * A box whose UVs are in metres on every face, so tiled textures keep their
 * real size whatever the box's proportions.
 */
export function metricBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; four vertices each.
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}
