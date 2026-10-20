import { describe, expect, it } from "vitest";
import { canHaveFinish, surfaceLook } from "./surfaceFinish";
import { listingSite } from "./houses/listing91770873";
import type { SurfaceKind } from "../types";

describe("surfaceLook", () => {
  it("keeps every surface's usual look when no finish is set", () => {
    for (const kind of ["lawn", "patio", "drive", "path", "bed", "pavement", "road"] as SurfaceKind[]) {
      expect(surfaceLook({ kind })).toBe(kind);
    }
  });

  it("uses the finish on hard surfaces only", () => {
    expect(surfaceLook({ kind: "drive", finish: "tarmac" })).toBe("tarmac");
    expect(surfaceLook({ kind: "patio", finish: "block-weathered" })).toBe("block-weathered");
    expect(surfaceLook({ kind: "path", finish: "gravel" })).toBe("gravel");
    // A lawn or a road cannot be paved: a stale finish is ignored.
    expect(surfaceLook({ kind: "lawn", finish: "tarmac" })).toBe("lawn");
    expect(surfaceLook({ kind: "road", finish: "slabs" })).toBe("road");
    expect(canHaveFinish("drive")).toBe(true);
    expect(canHaveFinish("lawn")).toBe(false);
  });

  it("lays the listing's drive in tarmac and its patio in weathered block paving", () => {
    const { surfaces } = listingSite();
    const drive = surfaces.filter((s) => s.kind === "drive");
    const patio = surfaces.filter((s) => s.kind === "patio");
    expect(drive.length).toBeGreaterThan(0);
    expect(patio.length).toBeGreaterThan(0);
    for (const s of drive) expect(surfaceLook(s)).toBe("tarmac");
    for (const s of patio) expect(surfaceLook(s)).toBe("block-weathered");
  });
});
