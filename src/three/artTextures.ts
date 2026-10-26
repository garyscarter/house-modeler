import * as THREE from "three";
import { DEFAULT_PRINT } from "../lib/art";
import { canvas, rng } from "./textures";

/**
 * The sample prints for Picture fixtures, drawn once per design and aspect
 * ratio onto a small canvas and kept as textures. Each design is drawn to
 * fit whatever frame it is in, so a landscape and a portrait of the same
 * print both look composed.
 */

const SIZE = 512;
const cache = new Map<string, THREE.CanvasTexture>();

export function artTexture(print: string | undefined, w: number, h: number): THREE.CanvasTexture {
  const id = print ?? DEFAULT_PRINT;
  const aspect = Math.round((w / h) * 20) / 20;
  const key = `${id}|${aspect}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = aspect >= 1 ? SIZE : Math.round(SIZE * aspect);
  const H = aspect >= 1 ? Math.round(SIZE / aspect) : SIZE;
  const [cv, c] = canvas(W, H);
  (DRAW[id] ?? DRAW[DEFAULT_PRINT])(c, W, H);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

type Draw = (c: CanvasRenderingContext2D, W: number, H: number) => void;

const paper = (c: CanvasRenderingContext2D, W: number, H: number, hex = "#f3efe6") => {
  c.fillStyle = hex;
  c.fillRect(0, 0, W, H);
};

const DRAW: Record<string, Draw> = {
  // Bauhaus-style colour blocks with one circle.
  blocks(c, W, H) {
    paper(c, W, H, "#ece6d8");
    const rnd = rng(3);
    const cols = ["#c9463d", "#2f4a7a", "#e4b63a", "#1f1f1f", "#7a9a7e"];
    const m = Math.min(W, H);
    const rects: [number, number, number, number][] = [
      [0.08, 0.1, 0.42, 0.5],
      [0.55, 0.08, 0.37, 0.3],
      [0.55, 0.45, 0.37, 0.47],
      [0.08, 0.66, 0.42, 0.26],
    ];
    rects.forEach(([x, y, w, h], i) => {
      c.fillStyle = cols[i % cols.length];
      c.fillRect(x * W, y * H, w * W, h * H);
    });
    c.fillStyle = cols[4];
    c.beginPath();
    c.arc(0.29 * W, 0.35 * H, m * 0.13, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.06)";
    for (let i = 0; i < 400; i++) c.fillRect(rnd() * W, rnd() * H, 2, 2);
  },
  // Boho arches in terracotta and sand.
  arches(c, W, H) {
    paper(c, W, H, "#f1e7d8");
    const cols = ["#c8795a", "#e0b48a", "#8a6a4e", "#d9c7a8"];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const r = (0.5 - i * 0.11) * Math.min(W, H * 0.7);
      c.fillStyle = cols[i % cols.length];
      c.beginPath();
      c.moveTo(W / 2 - r, H * 0.92);
      c.lineTo(W / 2 - r, H * 0.45);
      c.arc(W / 2, H * 0.45, r, Math.PI, 0);
      c.lineTo(W / 2 + r, H * 0.92);
      c.closePath();
      c.fill();
    }
    c.fillStyle = "#e8c66e";
    c.beginPath();
    c.arc(W * 0.78, H * 0.2, Math.min(W, H) * 0.07, 0, Math.PI * 2);
    c.fill();
  },
  // A continuous-line face in black ink on white.
  line(c, W, H) {
    paper(c, W, H, "#fbfaf6");
    c.strokeStyle = "#1a1a1a";
    c.lineWidth = Math.max(2, Math.min(W, H) * 0.012);
    c.lineCap = "round";
    c.lineJoin = "round";
    const s = Math.min(W, H);
    const ox = W / 2;
    const oy = H / 2;
    c.beginPath();
    c.moveTo(ox - s * 0.22, oy - s * 0.3);
    c.bezierCurveTo(ox - s * 0.4, oy - s * 0.1, ox - s * 0.3, oy + s * 0.25, ox - s * 0.05, oy + s * 0.28);
    c.bezierCurveTo(ox + s * 0.05, oy + s * 0.3, ox + s * 0.12, oy + s * 0.15, ox + s * 0.08, oy + s * 0.05);
    c.bezierCurveTo(ox + s * 0.16, oy + s * 0.02, ox + s * 0.14, oy - s * 0.08, ox + s * 0.06, oy - s * 0.06);
    c.bezierCurveTo(ox + s * 0.1, oy - s * 0.18, ox + s * 0.02, oy - s * 0.3, ox - s * 0.22, oy - s * 0.3);
    c.moveTo(ox - s * 0.1, oy - s * 0.05);
    c.bezierCurveTo(ox - s * 0.04, oy - s * 0.1, ox + s * 0.02, oy - s * 0.06, ox - s * 0.02, oy - s * 0.02);
    c.moveTo(ox - s * 0.08, oy + s * 0.12);
    c.bezierCurveTo(ox - s * 0.02, oy + s * 0.16, ox + s * 0.03, oy + s * 0.14, ox + s * 0.04, oy + s * 0.11);
    c.stroke();
  },
  // Layered hills under a low sun, in dusk tones.
  hills(c, W, H) {
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#f2c9a2");
    sky.addColorStop(1, "#e59b7a");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#f7e2b8";
    c.beginPath();
    c.arc(W * 0.62, H * 0.38, Math.min(W, H) * 0.12, 0, Math.PI * 2);
    c.fill();
    const tones = ["#b96a62", "#8a4e5a", "#5c3b55", "#2f2a40"];
    tones.forEach((t, i) => {
      const base = H * (0.5 + i * 0.13);
      c.fillStyle = t;
      c.beginPath();
      c.moveTo(0, H);
      c.lineTo(0, base);
      for (let x = 0; x <= W; x += W / 8) {
        const y = base - Math.sin((x / W) * Math.PI * (1.5 + i * 0.7) + i) * H * 0.06;
        c.quadraticCurveTo(x + W / 16, y - H * 0.03, x + W / 8, y);
      }
      c.lineTo(W, H);
      c.closePath();
      c.fill();
    });
  },
  // A eucalyptus sprig in soft greens.
  botanical(c, W, H) {
    paper(c, W, H, "#f6f3ec");
    c.strokeStyle = "#6f7f62";
    c.lineWidth = Math.max(2, Math.min(W, H) * 0.008);
    c.beginPath();
    c.moveTo(W * 0.5, H * 0.92);
    c.quadraticCurveTo(W * 0.46, H * 0.5, W * 0.56, H * 0.1);
    c.stroke();
    const rnd = rng(11);
    for (let i = 0; i < 11; i++) {
      const t = 0.14 + i * 0.07;
      const x = W * (0.5 + (0.56 - 0.5) * ((1 - t) / 0.9)) + (W * 0.46 - W * 0.5) * Math.sin(t * Math.PI) * 0.5;
      const y = H * (0.92 - t * 0.9);
      const side = i % 2 ? 1 : -1;
      const r = Math.min(W, H) * (0.07 - i * 0.003);
      c.fillStyle = ["#8fa58a", "#a7b89c", "#7d9478"][i % 3];
      c.beginPath();
      c.ellipse(x + side * r * 0.9, y, r, r * 0.75, side * (0.4 + rnd() * 0.3), 0, Math.PI * 2);
      c.fill();
    }
  },
  // Loose black ink strokes on cream.
  ink(c, W, H) {
    paper(c, W, H, "#f4f0e6");
    const rnd = rng(7);
    c.strokeStyle = "#1c1c1c";
    c.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      c.lineWidth = Math.min(W, H) * (0.015 + rnd() * 0.05);
      c.globalAlpha = 0.65 + rnd() * 0.35;
      c.beginPath();
      const y = H * (0.2 + i * 0.15);
      c.moveTo(W * (0.1 + rnd() * 0.1), y + rnd() * H * 0.05);
      c.bezierCurveTo(W * 0.35, y - H * 0.08, W * 0.65, y + H * 0.08, W * (0.8 + rnd() * 0.12), y - rnd() * H * 0.05);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.fillStyle = "#c9463d";
    c.beginPath();
    c.arc(W * 0.8, H * 0.82, Math.min(W, H) * 0.035, 0, Math.PI * 2);
    c.fill();
  },
};
