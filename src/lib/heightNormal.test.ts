import { describe, expect, it } from "vitest";
import { blurHeights, heightToNormal, redHeights } from "./heightNormal";

const px = (out: Uint8ClampedArray, w: number, x: number, y: number) => [...out.slice(4 * (y * w + x), 4 * (y * w + x) + 4)];
/** A w x h field from f(x, y). */
const field = (w: number, h: number, f: (x: number, y: number) => number) => {
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y);
  return a;
};

describe("heightToNormal", () => {
  it("gives a flat normal for a flat field, from floats or RGBA bytes", () => {
    const out = heightToNormal(field(4, 3, () => 0.4), 4, 3, 5);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) expect(px(out, 4, x, y)).toEqual([128, 128, 255, 255]);
    const bytes = new Uint8ClampedArray(4 * 12).fill(90);
    expect(px(heightToNormal(bytes, 4, 3, 5), 4, 2, 1)).toEqual([128, 128, 255, 255]);
  });

  it("tilts red below 128 on a ramp rising in +x, and green above 128 on one rising down the canvas", () => {
    const rx = heightToNormal(field(8, 4, (x) => x * 0.05), 8, 4, 2, false);
    const [r, g] = px(rx, 8, 4, 2);
    expect(r).toBeLessThan(128);
    expect(g).toBe(128);
    const ry = heightToNormal(field(4, 8, (_, y) => y * 0.05), 4, 8, 2, false);
    const [r2, g2] = px(ry, 4, 2, 4);
    expect(r2).toBe(128);
    expect(g2).toBeGreaterThan(128);
  });

  it("wraps: column 0's gradient reads column w-1", () => {
    // Only the last column is raised: with wrap, column 0 sees it on its left (falling to +x) and tilts red up.
    const f = field(6, 3, (x) => (x === 5 ? 1 : 0));
    expect(px(heightToNormal(f, 6, 3, 2, true), 6, 0, 1)[0]).toBeGreaterThan(128);
    expect(px(heightToNormal(f, 6, 3, 2, false), 6, 0, 1)[0]).toBe(128);
    // A seamless tile repeats exactly: the edge column matches the interior column with the same neighbours.
    const saw = field(6, 3, (x) => [0, 0.2, 0.4, 0.4, 0.2, 0][x]);
    const out = heightToNormal(saw, 6, 3, 3, true);
    expect(px(out, 6, 0, 1)).toEqual(px(out, 6, 5, 1).map((v, i) => (i === 0 ? 255 - v : v)));
  });

  it("scales the tilt linearly with strength", () => {
    const f = field(8, 3, (x) => x * 0.1);
    const tilt = (s: number) => {
      const [r, , b] = px(heightToNormal(f, 8, 3, s, false), 8, 4, 1);
      return (127.5 - r) / (b - 127.5); // nx / nz before encoding, = s * gradient
    };
    // Bytes quantise the normal to 1/127, so allow a few per cent.
    expect(Math.abs(tilt(1) - 0.1)).toBeLessThan(0.005);
    expect(Math.abs(tilt(3) / tilt(1) - 3)).toBeLessThan(0.15);
    expect(Math.abs(tilt(6) / tilt(3) - 2)).toBeLessThan(0.05);
  });
});

describe("blurHeights", () => {
  it("keeps a flat field, spreads a step over 2r+1 pixels and wraps at the edges", () => {
    expect([...blurHeights(new Float32Array(12).fill(0.3), 4, 3, 1)].every((v) => Math.abs(v - 0.3) < 1e-6)).toBe(true);
    const spike = field(7, 1, (x) => (x === 0 ? 1 : 0));
    const b = blurHeights(spike, 7, 1, 1);
    expect(b[0]).toBeCloseTo(1 / 3);
    expect(b[1]).toBeCloseTo(1 / 3);
    expect(b[6]).toBeCloseTo(1 / 3); // wrapped from column 0
    expect(b[3]).toBe(0);
  });

  it("reads the red channel of RGBA as heights", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 51, 200, 200, 255]);
    expect([...redHeights(rgba, 2, 1)].map((v) => +v.toFixed(2))).toEqual([1, 0.2]);
  });
});
