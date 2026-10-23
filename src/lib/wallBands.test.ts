import { describe, expect, it } from "vitest";
import { BASE_LABEL, coverLayout, coverTop, coverV, hasAccent, interiorFinish, splitFinish, splitQuadAtY, wallAccent, wallBase } from "./wallCovering";
import { WALL_COVERING_LABEL, type WallCovering } from "../types";
import type { FaceQuad } from "./walls";
import { rect } from "./testing";

const room = (extra: Parameters<typeof rect>[5] = {}) => rect("A", 0, 0, 300, 300, extra);

describe("modern coverings", () => {
  const ALL = Object.keys(WALL_COVERING_LABEL) as WallCovering[];

  it("labels every covering and gives each a base label", () => {
    for (const c of ALL) {
      expect(WALL_COVERING_LABEL[c].length).toBeGreaterThan(3);
      expect(BASE_LABEL[c].length).toBeGreaterThan(3);
    }
    expect(new Set(ALL.map((c) => WALL_COVERING_LABEL[c])).size).toBe(ALL.length);
  });

  it("starts each pattern from colours that look right straight away", () => {
    for (const c of ALL.filter((x) => x !== "paint")) {
      const r = room({ wallCovering: c });
      expect(wallBase(r)).toMatch(/^#[0-9a-f]{6}$/);
      if (hasAccent(c) && c !== "tiles") expect(wallAccent(r)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("ignores a second colour on coverings that are a single colour", () => {
    for (const c of ["panellingFull", "batten", "limewash", "microcement"] as const) {
      expect(hasAccent(c)).toBe(false);
      expect(wallAccent(room({ wallCovering: c, wallAccent: "#ff0000" }))).toBeNull();
    }
    expect(hasAccent("panelling")).toBe(true);
    expect(hasAccent("metro")).toBe(true);
  });

  it("takes the panel colour from the accent and keeps the wall colour for above", () => {
    const f = interiorFinish(room({ wallCovering: "panelling", wallPaint: "#f0ece4", wallAccent: "#6b7f6a" }), undefined);
    expect(f).toEqual({ covering: "panelling", color: "#f0ece4", accent: "#6b7f6a" });
    expect(splitFinish(f)).toEqual({
      lower: { covering: "panelling", color: "#6b7f6a", accent: null },
      upper: { covering: "paint", color: "#f0ece4" },
    });
  });

  it("splits boards like panelling and splashback tiles with paint of the tile colour above", () => {
    const t = splitFinish(interiorFinish(room({ wallCovering: "tongue", wallPaint: "#f4f1ea", wallAccent: "#cfc6b4" }), undefined));
    expect(t.lower).toEqual({ covering: "tongue", color: "#cfc6b4", accent: null });
    expect(t.upper).toEqual({ covering: "paint", color: "#f4f1ea" });
    const m = splitFinish(interiorFinish(room({ wallCovering: "metroSplash", wallPaint: "#e8efe9", wallAccent: "#aaaaaa" }), undefined));
    expect(m.lower).toEqual({ covering: "metroSplash", color: "#e8efe9", accent: "#aaaaaa" });
    expect(m.upper).toEqual({ covering: "paint", color: "#e8efe9" });
  });

  it("leaves full-height coverings whole", () => {
    for (const c of ["panellingFull", "batten", "metro", "zellige", "deco", "leaves", "limewash", "microcement", "floral", "brick"] as const) {
      const f = interiorFinish(room({ wallCovering: c }), undefined);
      expect(splitFinish(f)).toEqual({ lower: f, upper: null });
    }
    expect(splitFinish({ covering: "paint", color: "#fff" }).upper).toBeNull();
  });
});

describe("coverTop", () => {
  const dado = coverLayout("panelling")!;
  const splash = coverLayout("metroSplash")!;

  it("reaches the band's height, or the ceiling for full-height panelling", () => {
    expect(coverTop(dado, 2.4, [])).toBeCloseTo(1.1);
    expect(coverTop(splash, 2.4, [])).toBeCloseTo(1.2);
    expect(coverTop(coverLayout("panellingFull")!, 2.4, [])).toBe(2.4);
    expect(coverTop(coverLayout("panellingFull")!, 2.7, [0.9])).toBe(2.7);
  });

  it("never rises above a low ceiling", () => {
    expect(coverTop(dado, 1, [])).toBe(1);
  });

  it("stops at a window sill just under the top, so no sliver of dado runs up the reveal", () => {
    expect(coverTop(dado, 2.4, [0.95])).toBeCloseTo(0.95);
    expect(coverTop(dado, 2.4, [0.9])).toBeCloseTo(0.9);
    expect(coverTop(splash, 2.4, [1.05])).toBeCloseTo(1.05);
  });

  it("ignores sills that are well under the band, level with it or above it, and doors", () => {
    expect(coverTop(dado, 2.4, [0.6])).toBeCloseTo(1.1);
    expect(coverTop(dado, 2.4, [1.1, 1.4])).toBeCloseTo(1.1);
    expect(coverTop(dado, 2.4, [0])).toBeCloseTo(1.1);
  });

  it("takes the lowest of several close sills", () => {
    expect(coverTop(dado, 2.4, [1, 0.95])).toBeCloseTo(0.95);
  });
});

describe("coverV", () => {
  it("stretches a fitted texture over the band and leaves a repeating one at its true height", () => {
    const dado = coverLayout("panelling")!;
    expect(coverV(dado, 1.1, 1.1)).toBeCloseTo(1.1);
    expect(coverV(dado, 0.475, 0.95)).toBeCloseTo(0.55);
    const full = coverLayout("panellingFull")!;
    expect(coverV(full, 2.7, 2.7)).toBeCloseTo(2.4);
    const splash = coverLayout("metroSplash")!;
    expect(coverV(splash, 0.9, 1.2)).toBeCloseTo(0.9);
  });

  it("only banded and fitted coverings have a layout", () => {
    expect(coverLayout("paint")).toBeUndefined();
    expect(coverLayout("floral")).toBeUndefined();
    expect(coverLayout("zellige")).toBeUndefined();
    expect(coverLayout("tongue")?.band).toBeCloseTo(1.1);
  });
});

describe("splitQuadAtY", () => {
  const slot = { kind: "inside", roomId: "A" } as const;
  /** A vertical face along x from 0 to 2 (metres), y0..y1, uv in metres. */
  const wall = (y0: number, y1: number, flip = false): FaceQuad => {
    const q: FaceQuad = {
      v: [
        [0, y0, 0],
        [2, y0, 0],
        [2, y1, 0],
        [0, y1, 0],
      ],
      n: [0, 0, 1],
      uv: [
        [10, y0],
        [12, y0],
        [12, y1],
        [10, y1],
      ],
      slot,
    };
    return flip ? { ...q, v: [q.v[0], q.v[3], q.v[2], q.v[1]], uv: [q.uv[0], q.uv[3], q.uv[2], q.uv[1]] } : q;
  };

  it("cuts a tall face into the band and the wall above, with matching texture coordinates", () => {
    for (const flip of [false, true]) {
      const [lo, hi] = splitQuadAtY(wall(0, 2.4, flip), 1.1);
      expect(lo && hi).toBeTruthy();
      expect(Math.min(...lo!.v.map((p) => p[1]))).toBeCloseTo(0);
      expect(Math.max(...lo!.v.map((p) => p[1]))).toBeCloseTo(1.1);
      expect(Math.min(...hi!.v.map((p) => p[1]))).toBeCloseTo(1.1);
      expect(Math.max(...hi!.v.map((p) => p[1]))).toBeCloseTo(2.4);
      for (const q of [lo!, hi!]) {
        q.v.forEach((p, i) => expect(q.uv[i][1]).toBeCloseTo(p[1]));
        q.v.forEach((p, i) => expect(q.uv[i][0]).toBeCloseTo(10 + p[0]));
        expect(q.n).toEqual([0, 0, 1]);
        expect(q.slot).toEqual(slot);
        expect(q.v).toHaveLength(4);
      }
    }
  });

  it("keeps the winding of the face it cuts", () => {
    const sign = (q: FaceQuad) => {
      let a = 0;
      for (let i = 0; i < 4; i++) {
        const p = q.v[i];
        const r = q.v[(i + 1) % 4];
        a += p[0] * r[1] - r[0] * p[1];
      }
      return Math.sign(a);
    };
    for (const flip of [false, true]) {
      const src = wall(0, 2.4, flip);
      const [lo, hi] = splitQuadAtY(src, 1.1);
      expect(sign(lo!)).toBe(sign(src));
      expect(sign(hi!)).toBe(sign(src));
    }
  });

  it("hands a face wholly under or over the cut to one side", () => {
    expect(splitQuadAtY(wall(0, 0.9), 1.1)).toEqual([wall(0, 0.9), null]);
    expect(splitQuadAtY(wall(1.1, 2), 1.1)).toEqual([null, wall(1.1, 2)]);
    expect(splitQuadAtY(wall(1.5, 2), 1.1)).toEqual([null, wall(1.5, 2)]);
  });

  it("puts a flat face (a sill or soffit) on its side of the cut, a face on the cut counting as below", () => {
    const flat = (y: number): FaceQuad => ({
      v: [
        [0, y, 0],
        [1, y, 0],
        [1, y, 1],
        [0, y, 1],
      ],
      n: [0, 1, 0],
      uv: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      slot,
    });
    expect(splitQuadAtY(flat(0.95), 0.95)[0]).not.toBeNull();
    expect(splitQuadAtY(flat(0.95), 0.95)[1]).toBeNull();
    expect(splitQuadAtY(flat(2.05), 1.1)[0]).toBeNull();
    expect(splitQuadAtY(flat(0.9), 1.1)[1]).toBeNull();
  });
});
