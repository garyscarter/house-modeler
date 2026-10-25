import { describe, expect, it } from "vitest";
import { WARM_WHITE, interiorFinish, outsideLook, wallAccent, wallBase, hasAccent, hasBaseColour, splitFinish } from "./wallCovering";
import { rect } from "./testing";

const room = (extra: Parameters<typeof rect>[5] = {}) => rect("A", 0, 0, 300, 300, extra);

describe("interiorFinish", () => {
  it("paints warm white by default", () => {
    expect(interiorFinish(room(), undefined)).toEqual({ covering: "paint", color: WARM_WHITE });
    expect(interiorFinish(undefined, undefined)).toEqual({ covering: "paint", color: WARM_WHITE });
  });

  it("uses the room's paint and ignores a pattern colour on paint", () => {
    expect(interiorFinish(room({ wallPaint: "#d9e6d3", wallAccent: "#ff0000" }), undefined)).toEqual({ covering: "paint", color: "#d9e6d3" });
  });

  it("paints a wall with its own colour plainly, whatever the room's covering", () => {
    expect(interiorFinish(room({ wallCovering: "floral", wallPaint: "#ffffff" }), "#334455")).toEqual({ covering: "paint", color: "#334455" });
  });

  it("keeps the covering, ground and pattern colour", () => {
    expect(interiorFinish(room({ wallCovering: "floral", wallPaint: "#f3efe9", wallAccent: "#c8364a" }), undefined)).toEqual({
      covering: "floral",
      color: "#f3efe9",
      accent: "#c8364a",
    });
  });

  it("fills in defaults per covering", () => {
    const brick = room({ wallCovering: "brick" });
    expect(wallBase(brick)).not.toBe(WARM_WHITE);
    expect(wallAccent(brick)).toMatch(/^#[0-9a-f]{6}$/);
    expect(wallBase(room({ wallCovering: "stripe" }))).toBe(WARM_WHITE);
    expect(wallAccent(room({ wallCovering: "sprig" }))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("leaves tiles without a feature strip unless a colour is chosen", () => {
    expect(interiorFinish(room({ wallCovering: "tiles", wallPaint: "#dccbb8" }), undefined)).toEqual({ covering: "tiles", color: "#dccbb8", accent: null });
    expect(wallAccent(room({ wallCovering: "tiles", wallAccent: "#c9b79c" }))).toBe("#c9b79c");
  });
});

describe("outsideLook", () => {
  const house = { finish: "render" as const, color: "#efe9d8" };
  const brickRoom = (extra: Parameters<typeof rect>[5] = {}) => room({ exteriorFinish: "brick", exteriorColor: "#a8553a", ...extra });

  it("follows the room, then the house", () => {
    expect(outsideLook(brickRoom(), 0, house)).toEqual({ finish: "brick", color: "#a8553a" });
    expect(outsideLook(room(), 0, house)).toEqual(house);
    expect(outsideLook(undefined, undefined, house)).toEqual(house);
  });

  it("takes a wall's own finish, starting from the house colour rather than the room's brick colour", () => {
    const r = brickRoom({ wallFinishes: { 2: { outside: { finish: "render" } } } });
    expect(outsideLook(r, 2, house)).toEqual({ finish: "render", color: "#efe9d8" });
    // The other walls stay brick.
    expect(outsideLook(r, 1, house)).toEqual({ finish: "brick", color: "#a8553a" });
  });

  it("recolours the room's finish when only a colour is set", () => {
    expect(outsideLook(brickRoom({ wallFinishes: { 0: { outside: { color: "#884433" } } } }), 0, house)).toEqual({ finish: "brick", color: "#884433" });
  });

  it("ignores an inside-only override, and overrides on edges the room does not have", () => {
    expect(outsideLook(brickRoom({ wallFinishes: { 0: { covering: "tiles" } } }), 0, house)).toEqual({ finish: "brick", color: "#a8553a" });
    expect(outsideLook(brickRoom({ wallFinishes: { 9: { outside: { finish: "render" } } } }), 9, house)).toEqual({ finish: "brick", color: "#a8553a" });
  });
});

describe("fixed-colour coverings", () => {
  it("offers neither colour for the parrot paper and both for an ordinary wallpaper", () => {
    expect(hasBaseColour("jungle")).toBe(false);
    expect(hasAccent("jungle")).toBe(false);
    expect(wallAccent({ wallCovering: "jungle", wallAccent: "#123456" })).toBeNull();
    expect(hasBaseColour("floral")).toBe(true);
    expect(hasAccent("floral")).toBe(true);
    expect(hasBaseColour("paint")).toBe(true);
  });
});

describe("wall above a half-height covering", () => {
  const base = { wallCovering: "panelling", wallPaint: "#f1ece2", wallAccent: "#6f8071" } as const;
  const clean = (f: ReturnType<typeof splitFinish>) => {
    for (const x of [f.lower, f.upper]) if (x) expect("upper" in x).toBe(false);
  };

  it("papers above panelling", () => {
    const s = splitFinish(interiorFinish(room({ ...base, upperCovering: "floral" }), undefined));
    expect(s.lower).toEqual({ covering: "panelling", color: "#6f8071", accent: null });
    expect(s.upper).toEqual({ covering: "floral", color: "#f1ece2", accent: "#c8364a" });
    clean(s);
    const c = splitFinish(interiorFinish(room({ ...base, upperCovering: "floral", upperAccent: "#112233" }), undefined));
    expect(c.upper).toEqual({ covering: "floral", color: "#f1ece2", accent: "#112233" });
  });

  it("paints above when no upper covering is set", () => {
    const s = splitFinish(interiorFinish(room(base), undefined));
    expect(s.upper).toEqual({ covering: "paint", color: "#f1ece2" });
    clean(s);
  });

  it("ignores the upper covering on a feature wall with another covering", () => {
    const r = room({ ...base, upperCovering: "floral", wallFinishes: { 0: { covering: "floral" } } });
    const f = interiorFinish(r, undefined, 0);
    expect(f.covering).toBe("floral");
    expect("upper" in f).toBe(false);
  });

  it("returns no upper for a full-height covering", () => {
    expect(splitFinish(interiorFinish(room({ wallCovering: "panellingFull", upperCovering: "floral" }), undefined)).upper).toBeNull();
  });

  it("falls back to paint for a covering not allowed above", () => {
    const s = splitFinish(interiorFinish(room({ ...base, upperCovering: "metro" }), undefined));
    expect(s.upper).toEqual({ covering: "paint", color: "#f1ece2" });
  });
});
