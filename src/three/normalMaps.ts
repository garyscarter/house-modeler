import * as THREE from "three";
import { blurHeights, heightToNormal, redHeights } from "../lib/heightNormal";

/**
 * Normal and roughness maps derived from the painted finishes' height canvases (and, for wood, the colour canvas),
 * so raking light catches mortar, grout, laps and board joints with mipmapped relief rather than a bump map's
 * screen-space derivatives, and the path tracer, which ignores bump maps, sees the same relief.
 *
 * Like the height maps they come from, each map depends only on the seeded pattern, never on the colour, so one per
 * pattern key serves every colour. They live as long as the page (as the old shared bump maps did): the material
 * caches in textures.ts dispose only the per-colour maps they own, never these.
 */

/**
 * How steeply a height step tilts the baked normal (per pixel, height 0..1), after a blur of BEVEL_PX that turns
 * the painted one-pixel steps into bevels a few pixels wide; materials then scale it per finish with `normalScale`.
 */
export const NORMAL_STRENGTH = 9;
const BEVEL_PX = 3;

/** A roughness map's recipe: the face roughness, how much rougher the joints (low in the height map) are, and wood grain. */
export interface RoughSpec {
  base: number;
  /** Added to `base` where the height map is low (mortar, grout, joints, laps), 0 to keep it uniform. */
  joint: number;
  /** Faint modulation from the colour canvas's luminance (wood grain): darker figure is this much rougher, as a fraction. */
  grain?: number;
}

type Painted = { color: HTMLCanvasElement; height: HTMLCanvasElement | null };

const normals = new Map<string, THREE.CanvasTexture>();
const roughness = new Map<string, THREE.CanvasTexture>();

function texture(img: HTMLCanvasElement, tile: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile[0], 1 / tile[1]);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 16; // three clamps this to what the GPU supports
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function pixels(src: HTMLCanvasElement, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function put(data: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return c;
}

/** The tangent-space normal map of a height canvas (red channel), at its size, wrapping so tiles never seam. Cached by `key`. */
export function normalFromHeight(key: string, heightCanvas: HTMLCanvasElement | (() => HTMLCanvasElement), tile: [number, number], strength = NORMAL_STRENGTH): THREE.CanvasTexture {
  let t = normals.get(key);
  if (!t) {
    const height = typeof heightCanvas === "function" ? heightCanvas() : heightCanvas;
    const { width: w, height: h } = height;
    const hf = blurHeights(redHeights(pixels(height, w, h), w, h), w, h, BEVEL_PX);
    t = texture(put(heightToNormal(hf, w, h, strength, true), w, h), tile);
    normals.set(key, t);
  }
  return t;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A half-size greyscale roughness map: `spec.base` on faces, rougher in the joints (dark in the height canvas), and
 * for wood a faint grain from the colour canvas. Three multiplies `roughnessMap` (green) by `roughness`, so materials
 * that take one set `roughness: 1`. Null without a height canvas. Cached by `key`.
 */
export function roughnessFromPainted(key: string, paint: Painted | (() => Painted), spec: RoughSpec, tile: [number, number]): THREE.CanvasTexture | null {
  let t = roughness.get(key);
  if (t) return t;
  const painted = typeof paint === "function" ? paint() : paint;
  if (!painted.height) return null;
  const w = Math.max(1, Math.round(painted.height.width / 2));
  const h = Math.max(1, Math.round(painted.height.height / 2));
  const hp = pixels(painted.height, w, h);
  const n = w * h;
  const lum = spec.grain ? new Float32Array(n) : null;
  let mean = 0;
  if (lum) {
    const cp = pixels(painted.color, w, h);
    for (let i = 0; i < n; i++) {
      lum[i] = (0.2126 * cp[4 * i] + 0.7152 * cp[4 * i + 1] + 0.0722 * cp[4 * i + 2]) / 255;
      mean += lum[i];
    }
    mean = Math.max(0.05, mean / n);
  }
  const out = new Uint8ClampedArray(4 * n);
  for (let i = 0; i < n; i++) {
    const face = smooth(0.22, 0.42, hp[4 * i] / 255);
    let r = spec.base + spec.joint * (1 - face);
    if (lum) r *= 1 + Math.max(-0.25, Math.min(0.25, (spec.grain! * (mean - lum[i])) / mean));
    const v = Math.round(Math.min(1, Math.max(0.02, r)) * 255);
    out[4 * i] = out[4 * i + 1] = out[4 * i + 2] = v;
    out[4 * i + 3] = 255;
  }
  t = texture(put(out, w, h), tile);
  roughness.set(key, t);
  return t;
}
