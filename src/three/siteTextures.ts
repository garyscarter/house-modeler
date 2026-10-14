import * as THREE from "three";
import type { SurfaceKind } from "../types";

/**
 * Procedural textures for the garden, boundaries and street, drawn once on
 * a canvas and shared by every viewer. Each covers `metres` of ground, so a
 * geometry with UVs in metres sets repeat to 1 / metres.
 */
export type TextureKind = SurfaceKind | "ground" | "fence" | "brick" | "hedge";

export interface SiteTexture {
  map: THREE.Texture;
  /** Size of one tile in metres. */
  metres: number;
}

const SIZE = 512;
const cache = new Map<TextureKind, SiteTexture>();

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

function draw(kind: TextureKind): { canvas: HTMLCanvasElement; metres: number } {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  const r = rng(kind.length * 7919 + kind.charCodeAt(0));
  let metres = 2;
  switch (kind) {
    case "lawn":
    case "ground": {
      const ground = kind === "ground";
      g.fillStyle = ground ? hsl(88, 14, 60) : hsl(88, 30, 38);
      g.fillRect(0, 0, SIZE, SIZE);
      if (!ground) {
        // Mowing stripes, two per tile.
        for (let i = 0; i < 2; i++) {
          g.fillStyle = "rgba(255,255,255,0.035)";
          g.fillRect(0, i * (SIZE / 2), SIZE, SIZE / 4);
        }
      }
      for (let i = 0; i < 9000; i++) {
        const x = r() * SIZE;
        const y = r() * SIZE;
        g.strokeStyle = hsl(78 + r() * 25, ground ? 12 + r() * 10 : 22 + r() * 22, (ground ? 50 : 27) + r() * 22, 0.55);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
        g.stroke();
      }
      metres = ground ? 4 : 2;
      break;
    }
    case "patio":
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
    case "drive": {
      // Block paving, 200 x 100 mm in stretcher bond, brindle colours.
      g.fillStyle = "#6f6258";
      g.fillRect(0, 0, SIZE, SIZE);
      const cols = 6;
      const rows = 12;
      const w = SIZE / cols;
      const h = SIZE / rows;
      for (let j = 0; j < rows; j++) {
        for (let i = -1; i < cols + 1; i++) {
          const off = (j % 2) * (w / 2);
          const red = r() < 0.6;
          g.fillStyle = red ? hsl(14 + r() * 8, 30 + r() * 15, 42 + r() * 10) : hsl(30, 8 + r() * 6, 40 + r() * 12);
          g.fillRect(i * w + off + 1.5, j * h + 1.5, w - 3, h - 3);
        }
      }
      speckle(g, r, 4000, 0.15, 0.2);
      metres = 1.2;
      break;
    }
    case "bed": {
      g.fillStyle = hsl(25, 28, 22);
      g.fillRect(0, 0, SIZE, SIZE);
      speckle(g, r, 8000, 0.12, 0.3, 3);
      // Shrubs and perennials seen from above.
      for (let i = 0; i < 70; i++) {
        const x = r() * SIZE;
        const y = r() * SIZE;
        const rad = 10 + r() * 34;
        const hue = r() < 0.12 ? (r() < 0.5 ? 330 : 45) : 85 + r() * 50;
        const flowering = hue < 80 || hue > 300;
        for (let k = 0; k < 14; k++) {
          g.fillStyle = hsl(hue + (r() - 0.5) * 12, flowering ? 55 : 30 + r() * 20, (flowering ? 60 : 24) + r() * 16, 0.8);
          g.beginPath();
          g.arc(x + (r() - 0.5) * rad, y + (r() - 0.5) * rad, rad * (0.2 + r() * 0.3), 0, Math.PI * 2);
          g.fill();
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
