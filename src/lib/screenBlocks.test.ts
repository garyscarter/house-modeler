import { describe, expect, it } from "vitest";
import { cutRun, SCREEN_BLOCK, screenBand, screenKey } from "./screenBlocks";

describe("screen-block panels", () => {
  it("run the whole edge in whole blocks when no extent is given", () => {
    const band = screenBand({ kind: "wall", height: 1.65, screen: { rows: 1 } }, 4.24, 0.06);
    expect(band).not.toBeNull();
    expect(band!.from).toBe(0);
    expect(band!.to).toBeCloseTo(14 * SCREEN_BLOCK, 6);
    expect(band!.height).toBeCloseTo(SCREEN_BLOCK, 6);
  });

  it("start where asked and snap the length down to whole blocks, inside the edge", () => {
    const band = screenBand({ kind: "wall", height: 1.4, screen: { rows: 2, from: 0.25, length: 1.2 } }, 3.82, 0.1025);
    expect(band).toMatchObject({ from: 0.25, rows: 2 });
    expect(band!.to).toBeCloseTo(0.25 + 4 * SCREEN_BLOCK, 6);
    const clipped = screenBand({ kind: "wall", height: 1.4, screen: { rows: 1, from: 3.5, length: 2 } }, 3.82, 0.1025);
    expect(clipped!.to).toBeCloseTo(3.5 + SCREEN_BLOCK, 6);
  });

  it("are left out of fences, short walls and edges with no room for a block", () => {
    expect(screenBand({ kind: "fence", height: 1.8, screen: { rows: 1 } }, 5, 0)).toBeNull();
    expect(screenBand({ kind: "wall", height: 0.6, screen: { rows: 1 } }, 5, 0.06)).toBeNull();
    expect(screenBand({ kind: "wall", height: 1.8, screen: { rows: 2, from: 4.9 } }, 5, 0.06)).toBeNull();
    expect(screenBand({ kind: "wall", height: 1.8 }, 5, 0.06)).toBeNull();
  });

  it("cut a run into plain and screened pieces", () => {
    const band = { from: 1, to: 2.16, rows: 1 as const, height: SCREEN_BLOCK };
    expect(cutRun(0, 3, band)).toEqual([
      { start: 0, end: 1, screened: false },
      { start: 1, end: 2.16, screened: true },
      { start: 2.16, end: 3, screened: false },
    ]);
    expect(cutRun(1.5, 3, band)).toEqual([
      { start: 1.5, end: 2.16, screened: true },
      { start: 2.16, end: 3, screened: false },
    ]);
    expect(cutRun(2.5, 3, band)).toEqual([{ start: 2.5, end: 3, screened: false }]);
    expect(cutRun(0, 3, null)).toEqual([{ start: 0, end: 3, screened: false }]);
  });

  it("compare panels by rows and extent", () => {
    expect(screenKey(undefined)).toBe("");
    expect(screenKey({ rows: 1 })).toBe(screenKey({ rows: 1, from: 0 }));
    expect(screenKey({ rows: 1 })).not.toBe(screenKey({ rows: 2 }));
    expect(screenKey({ rows: 1, length: 1.16 })).not.toBe(screenKey({ rows: 1 }));
  });
});
