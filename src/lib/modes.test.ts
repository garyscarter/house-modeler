import { describe, expect, it } from "vitest";
import { MODES, MODE_LABEL, PLAN_TOOLS, SITE_EDIT_ID, canSelect, isMode, modeSwitchPatch, pruneSelection, roomTapSelects, type ModeUi, type SelKind } from "./modes";

const ui = (p: Partial<ModeUi> = {}): ModeUi => ({
  mode: "build",
  tab: "plan",
  editFloorId: "f0",
  floorBeforeSite: null,
  selectedRoomId: "kitchen",
  selectedEdge: null,
  ...p,
});
const apply = (u: ModeUi, next: ModeUi["mode"]): ModeUi => ({ ...u, ...modeSwitchPatch(u, next) });

describe("modes", () => {
  it("lists the six modes in order with labels", () => {
    expect(MODES.map((m) => MODE_LABEL[m])).toEqual(["Build", "Decorate", "Furnish", "Garden", "Plot", "Review"]);
    expect(isMode("furnish")).toBe(true);
    expect(isMode("nope")).toBe(false);
  });

  it("canSelect matrix", () => {
    const kinds: SelKind[] = ["room", "edge", "opening", "wall", "canopy", "fixture", "corner"];
    const allowed = (m: (typeof MODES)[number]) => kinds.filter((k) => canSelect(m, k));
    expect(allowed("build")).toEqual(["room", "opening", "wall", "canopy", "corner"]);
    expect(allowed("decorate")).toEqual(["room", "edge", "wall"]);
    expect(allowed("furnish")).toEqual(["fixture"]);
    expect(allowed("plot")).toEqual([]);
    expect(allowed("review")).toEqual([]);
    expect(MODES.filter(roomTapSelects)).toEqual(["build", "decorate"]);
  });

  it("pruneSelection keeps only what the mode can select", () => {
    const all = { room: "r", opening: "o", wall: "w", fixtures: ["f"], canopy: 0 };
    expect(pruneSelection("build", all)).toEqual({ room: "r", opening: "o", wall: "w", canopy: 0 });
    expect(pruneSelection("decorate", all)).toEqual({ room: "r", wall: "w" });
    expect(pruneSelection("furnish", all)).toEqual({ fixtures: ["f"] });
    expect(pruneSelection("review", all)).toEqual({});
  });

  it("offers Calibrate only in Build", () => {
    for (const m of MODES) expect(PLAN_TOOLS[m].includes("calibrate")).toBe(m === "build");
    expect(PLAN_TOOLS.build).toHaveLength(10);
    expect(PLAN_TOOLS.furnish).toEqual(["select", "measure"]);
  });

  it("Build to Furnish clears the room and edge", () => {
    const u = apply(ui({ selectedEdge: { edge: 1, side: "inside" } }), "furnish");
    expect(u.selectedRoomId).toBeNull();
    expect(u.selectedEdge).toBeNull();
    expect(u.mode).toBe("furnish");
  });

  it("Build to Decorate keeps the room; Decorate to Build clears the edge", () => {
    const d = apply(ui(), "decorate");
    expect(d.selectedRoomId).toBe("kitchen");
    const picked = { ...d, selectedEdge: { edge: 2, side: "outside" as const } };
    const b = apply(picked, "build");
    expect(b.selectedRoomId).toBe("kitchen");
    expect(b.selectedEdge).toBeNull();
  });

  it("entering Plot on the plan stores the floor and opens the site; leaving restores it", () => {
    const p = apply(ui(), "plot");
    expect(p.editFloorId).toBe(SITE_EDIT_ID);
    expect(p.floorBeforeSite).toBe("f0");
    expect(p.selectedRoomId).toBeNull();
    const b = apply(p, "build");
    expect(b.editFloorId).toBe("f0");
    expect(b.floorBeforeSite).toBeNull();
  });

  it("entering Plot in 3D leaves editFloorId alone", () => {
    const p = apply(ui({ tab: "3d" }), "plot");
    expect(p.editFloorId).toBe("f0");
    expect(p.floorBeforeSite).toBeNull();
  });

  it("leaving Plot with no remembered floor falls back to null", () => {
    const b = apply(ui({ mode: "plot", editFloorId: SITE_EDIT_ID, floorBeforeSite: null }), "review");
    expect(b.editFloorId).toBeNull();
  });

  it("does not overwrite the remembered floor when already on the site", () => {
    const p = apply(ui({ mode: "build", editFloorId: SITE_EDIT_ID, floorBeforeSite: "f1" }), "plot");
    expect(p.floorBeforeSite).toBe("f1");
  });
});

describe("garden mode", () => {
  it("opens the site editor like Plot, and leaves it for a floor mode", () => {
    const g = modeSwitchPatch({ mode: "build", tab: "plan", editFloorId: "f1", floorBeforeSite: null, selectedRoomId: null, selectedEdge: null }, "garden");
    expect(g.editFloorId).toBe(SITE_EDIT_ID);
    expect(g.floorBeforeSite).toBe("f1");
    const b = modeSwitchPatch({ mode: "garden", tab: "plan", editFloorId: SITE_EDIT_ID, floorBeforeSite: "f1", selectedRoomId: null, selectedEdge: null }, "furnish");
    expect(b.editFloorId).toBe("f1");
  });

  it("clears the garden selection on every switch", () => {
    expect(modeSwitchPatch({ mode: "garden", tab: "plan", editFloorId: SITE_EDIT_ID, floorBeforeSite: null, selectedRoomId: null, selectedEdge: null, gardenSel: ["a"] }, "plot").gardenSel).toEqual([]);
  });
});
