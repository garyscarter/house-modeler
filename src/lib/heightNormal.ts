/**
 * Tangent-space normal maps from height maps, for the painted finishes (see three/normalMaps.ts).
 *
 * Convention (three.js, OpenGL style, the texture uploaded with flipY as canvas textures are): red is +u (canvas +x),
 * green is +v, which is canvas -y because the canvas's top row is the texture's top. A surface rising towards +x
 * tilts its normal towards -u, so red drops below 128; one rising towards the canvas bottom (-v) gives green above 128.
 * Use these maps with three's default `normalScale` (1, 1); a negative scale would invert the relief.
 */

/**
 * The normal map (RGBA bytes) of a `w` x `h` height field, row by row from the top. `height` is either one value per
 * pixel in 0..1 (a Float32Array) or RGBA bytes whose red channel is the height, as three's bump maps read it.
 * Gradients are 3x3 Sobel in height units per pixel; `strength` scales them, so the tilt grows linearly with it.
 * With `wrap` the edges read the opposite side, so a repeating tile has no seam; without, the edge pixels repeat.
 */
export function heightToNormal(height: Uint8ClampedArray | Float32Array, w: number, h: number, strength: number, wrap = true): Uint8ClampedArray {
  const n = w * h;
  const hf = new Float32Array(n);
  if (height instanceof Float32Array) {
    if (height.length < n) throw new Error("heightToNormal: height is smaller than w x h");
    hf.set(height.subarray(0, n));
  } else {
    if (height.length < 4 * n) throw new Error("heightToNormal: height is smaller than w x h RGBA");
    for (let i = 0; i < n; i++) hf[i] = height[4 * i] / 255;
  }
  const col = (x: number) => (wrap ? (x + w) % w : Math.min(w - 1, Math.max(0, x)));
  const row = (y: number) => (wrap ? (y + h) % h : Math.min(h - 1, Math.max(0, y)));
  const out = new Uint8ClampedArray(4 * n);
  for (let y = 0; y < h; y++) {
    const ym = row(y - 1) * w;
    const y0 = y * w;
    const yp = row(y + 1) * w;
    for (let x = 0; x < w; x++) {
      const xm = col(x - 1);
      const xp = col(x + 1);
      // Sobel, divided by 8 so a unit ramp per pixel gives a gradient of 1.
      const gx = (hf[ym + xp] + 2 * hf[y0 + xp] + hf[yp + xp] - hf[ym + xm] - 2 * hf[y0 + xm] - hf[yp + xm]) / 8;
      const gy = (hf[yp + xm] + 2 * hf[yp + x] + hf[yp + xp] - hf[ym + xm] - 2 * hf[ym + x] - hf[ym + xp]) / 8;
      // Normal of z = s*h(u, v), with v = -canvas y: (-s dh/du, -s dh/dv, 1) = (-s gx, +s gy, 1).
      const nx = -strength * gx;
      const ny = strength * gy;
      const len = Math.hypot(nx, ny, 1);
      const o = 4 * (y0 + x);
      out[o] = Math.round(127.5 + 127.5 * (nx / len));
      out[o + 1] = Math.round(127.5 + 127.5 * (ny / len));
      out[o + 2] = Math.round(127.5 + 127.5 * (1 / len));
      out[o + 3] = 255;
    }
  }
  return out;
}

/** The red channel of RGBA bytes as heights in 0..1. */
export function redHeights(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = rgba[4 * i] / 255;
  return out;
}

/**
 * A separable box blur of radius `r` px (wrapping, so tiles stay seamless). Run before heightToNormal it turns a
 * painted one-pixel step into a bevel a few pixels wide, which survives the first mip levels instead of averaging
 * away, and it quietens per-pixel grain so the relief is not noisy.
 */
export function blurHeights(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src.slice();
  const k = 2 * r + 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += src[row + (((x + d) % w) + w) % w];
      tmp[row + x] = s / k;
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[((((y + d) % h) + h) % h) * w + x];
      out[y * w + x] = s / k;
    }
  return out;
}
