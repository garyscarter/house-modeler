import { describe, expect, it } from "vitest";
import { buildWalls, toWorld } from "../lib/geometry";
import { floor, rect } from "../lib/testing";
import { buildShell } from "./shell";

/** Rooms A and B side by side (3 m x 4 m, 1 px = 1 cm): a window from A to outside in the front wall, and a pane between them. */
const f = floor(
  [rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)],
  [
    { id: "out", kind: "window", x: 150, y: 400, orientation: "h", widthM: 1.2 },
    { id: "in", kind: "window", x: 300, y: 200, orientation: "v", widthM: 1 },
  ],
);

/** The glow slots on each pane's glass faces, by pane ("out" or "in") and which way the face points ("+x", "-x", "+z", "-z", or "edge"). */
function glassSlots() {
  const shell = buildShell({
    floor: f,
    walls: buildWalls(f),
    ceiling: 2.4,
    slab: 0.25,
    upperPolys: [],
    upperWalls: [],
    plinthY: null,
    baseY: 0,
    wallFinish: "render",
    wallColor: "#ffffff",
    trimColor: "#ffffff",
    doorColours: {},
    doorsOpen: false,
  });
  const out = new Map<string, Set<number>>();
  const outAt = toWorld(f, { x: 150, y: 400 });
  const inAt = toWorld(f, { x: 300, y: 200 });
  for (const m of shell.meshes) {
    if (m.spec.kind !== "glass") continue;
    const pos = m.geometry.getAttribute("position");
    const nor = m.geometry.getAttribute("normal");
    const slot = m.geometry.getAttribute("glowSlot");
    for (let i = 0; i < nor.count; i++) {
      const [nx, ny, nz] = [nor.getX(i), nor.getY(i), nor.getZ(i)];
      const pane = Math.hypot(pos.getX(i) - outAt.x, pos.getZ(i) - outAt.y) < 1 ? "out" : Math.hypot(pos.getX(i) - inAt.x, pos.getZ(i) - inAt.y) < 1 ? "in" : "?";
      const dir = Math.abs(nx) > 0.9 ? (nx > 0 ? "+x" : "-x") : Math.abs(nz) > 0.9 ? (nz > 0 ? "+z" : "-z") : Math.abs(ny) > 0.9 ? "edge" : "other";
      const key = `${pane} ${dir}`;
      if (!out.has(key)) out.set(key, new Set());
      out.get(key)!.add(slot.getX(i));
    }
  }
  return { slots: shell.roomSlots, byDir: out };
}

describe("buildShell glass glow slots", () => {
  const { slots, byDir } = glassSlots();
  const A = slots.get("A")!;
  const B = slots.get("B")!;

  it("numbers the rooms from 1 in floor order", () => {
    expect([A, B]).toEqual([1, 2]);
  });

  it("gives an outside window's outer face the room behind it, and its inner face none", () => {
    // Plan +y is world +z, the front: the front wall's outer face points +z and is seen from outside, looking into A.
    expect([...byDir.get("out +z")!]).toEqual([A]);
    expect([...byDir.get("out -z")!]).toEqual([0]);
  });

  it("gives each face of an internal pane the room on the far side", () => {
    // Facing +x it is seen from B and looks into A; facing -x the other way round.
    expect([...byDir.get("in +x")!]).toEqual([A]);
    expect([...byDir.get("in -x")!]).toEqual([B]);
  });

  it("never lights the thin edges of a pane", () => {
    for (const key of ["out +x", "out -x", "out edge", "in +z", "in -z", "in edge"]) for (const s of byDir.get(key) ?? []) expect(s, key).toBe(0);
  });

  it("finds glass on both panes and nowhere else", () => {
    expect([...byDir.keys()].filter((k) => k.startsWith("?"))).toEqual([]);
  });
});
