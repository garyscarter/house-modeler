import * as THREE from "three";
import { canvas, rng } from "./textures";

/**
 * Fixed-colour rug patterns, drawn once per pattern and size onto a canvas
 * (about 300 px per metre, long side capped at 2048) and kept as textures.
 * The canvas x axis runs along the rug's width (local x).
 */

const PX_PER_M = 300;
const MAX = 2048;
const cache = new Map<string, THREE.CanvasTexture>();

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };

const ROSETTE = ["#7e6f85", "#8a9270", "#d9a884", "#c9aaa6", "#aab8b5", "#8a9270", "#7e6f85", "#d9a884", "#6e7757"];
const GOLD = "#b9a23d";
const CORE = "#4a3f37";
const GROUND = "#d8d0bd";

function lighten(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** An irregular closed blob round (cx, cy): a jittered polygon smoothed through its edge midpoints. */
function blobPath(c: Ctx, cx: number, cy: number, r: number, rnd: () => number, stretch = 1, rot = 0) {
  const n = 6 + Math.floor(rnd() * 4);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const rr = r * (0.6 + rnd() * 0.8);
    const x = Math.cos(a) * rr * stretch;
    const y = Math.sin(a) * rr;
    pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1], pts[0]);
  c.beginPath();
  c.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    c.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  c.closePath();
}

function fillShape(c: Ctx, colour: string, edge: number) {
  c.fillStyle = colour;
  c.fill();
  c.lineWidth = edge;
  c.strokeStyle = lighten(colour, 0.22);
  c.globalAlpha = 0.5;
  c.stroke();
  c.globalAlpha = 1;
}

function drawLeopard(c: Ctx, W: number, H: number, ppm: number) {
  const rnd = rng(91770873);
  c.fillStyle = GROUND;
  c.fillRect(0, 0, W, H);
  // Tufted ground: many tiny low-contrast dots.
  const dots = Math.round((W * H) / 18);
  for (let i = 0; i < dots; i++) {
    c.fillStyle = rnd() < 0.5 ? "rgba(255,250,235,0.35)" : "rgba(120,105,85,0.16)";
    c.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  }
  const edge = Math.max(1, ppm * 0.006);
  const cellX = ppm * 0.29;
  const cellY = ppm * 0.27;
  const small: Pt[] = [];
  const placed: { x: number; y: number; r: number }[] = [];
  let k = 0;
  for (let j = -1; j * cellY < H + cellY; j++) {
    for (let i = -1; i * cellX < W + cellX; i++) {
      const cx = (i + 0.5 + (j & 1) * 0.5 + (rnd() - 0.5) * 0.5) * cellX;
      const cy = (j + 0.5 + (rnd() - 0.5) * 0.5) * cellY;
      if (rnd() < 0.1) {
        small.push({ x: cx, y: cy });
        continue;
      }
      const r = ppm * (0.1 + rnd() * 0.035);
      placed.push({ x: cx, y: cy, r: r * 0.9 });
      const colour = ROSETTE[k++ % ROSETTE.length];
      const rot = rnd() * Math.PI;
      const stretch = 0.85 + rnd() * 0.5;
      blobPath(c, cx, cy, r, rnd, stretch, rot);
      fillShape(c, colour, edge);
      if (rnd() < 0.35) {
        // A bite out of the edge: kidney and C shapes.
        const a = rnd() * Math.PI * 2;
        blobPath(c, cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, r * 0.48, rnd, 1, rot);
        c.fillStyle = GROUND;
        c.fill();
      } else if (rnd() < 0.2) {
        // A ring: the ground showing through off-centre.
        blobPath(c, cx + r * 0.1, cy, r * 0.32, rnd, 1.2, rot);
        c.fillStyle = GROUND;
        c.fill();
      }
      if (rnd() < 0.8) {
        blobPath(c, cx + (rnd() - 0.5) * r * 0.4, cy + (rnd() - 0.5) * r * 0.4, r * (0.28 + rnd() * 0.12), rnd, 1.4, rot + rnd());
        fillShape(c, CORE, edge);
      }
      // Mustard marks sit in the gaps: one between this cell and its right neighbour, one below, most of the time.
      if (rnd() < 0.85) small.push({ x: cx + cellX * 0.5, y: cy + (rnd() - 0.5) * cellY * 0.5 });
      if (rnd() < 0.85) small.push({ x: cx + (rnd() - 0.5) * cellX * 0.5, y: cy + cellY * 0.5 });
    }
  }
  c.lineCap = "round";
  for (const p of small) {
    const kind = rnd();
    const s = ppm * (0.03 + rnd() * 0.03);
    if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < q.r + s * 0.3)) continue;
    c.strokeStyle = GOLD;
    c.lineWidth = s * (0.4 + rnd() * 0.2);
    if (kind < 0.4) {
      const a0 = rnd() * Math.PI * 2;
      const sweep = ((240 + rnd() * 60) * Math.PI) / 180;
      c.beginPath();
      c.arc(p.x, p.y, s, a0, a0 + sweep);
      c.stroke();
    } else if (kind < 0.65) {
      const a0 = rnd() * Math.PI * 2;
      c.beginPath();
      c.arc(p.x, p.y, s * 1.2, a0, a0 + 1.6);
      c.stroke();
    } else if (kind < 0.9) {
      const a = rnd() * Math.PI;
      c.lineWidth = s * 0.35;
      for (let q = 0; q < 2; q++) {
        c.beginPath();
        c.moveTo(p.x + q * s * 0.5 - Math.cos(a) * s, p.y + q * s * 0.3 - Math.sin(a) * s);
        c.lineTo(p.x + q * s * 0.5 + Math.cos(a) * s, p.y + q * s * 0.3 + Math.sin(a) * s);
        c.stroke();
      }
    } else {
      blobPath(c, p.x, p.y, s * 0.7, rnd);
      fillShape(c, GOLD, edge);
    }
  }
}

const DRAW: Record<string, (c: Ctx, W: number, H: number, ppm: number) => void> = { leopard: drawLeopard };

export function rugTexture(id: string, w: number, d: number): THREE.CanvasTexture {
  const ppm = Math.min(PX_PER_M, MAX / Math.max(w, d, 0.1));
  const W = Math.max(8, Math.round(w * ppm));
  const H = Math.max(8, Math.round(d * ppm));
  const key = `${id}|${W}|${H}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [cv, c] = canvas(W, H);
  (DRAW[id] ?? drawLeopard)(c, W, H, ppm);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}
