import { usePanelPrefs } from "../components/panelPrefs";
import { describe, expect, it, vi } from "vitest";
import { buildCommands, fuzzyScore, rankCommands, type CommandContext } from "./commands";
import type { HouseModel } from "../types";

const room = (id: string, name: string) => ({ id, name, polygon: [] });
const model = { floors: [{ id: "g", name: "Ground floor", rooms: [room("r1", "Kitchen")] }, { id: "f", name: "First floor", rooms: [room("r2", "Bedroom 2")] }] } as unknown as HouseModel;

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  variants: { current: model },
  activeVariant: "current",
  tab: "plan",
  viewMode: "single",
  mode: "build",
  setMode: vi.fn(),
  look: "studio",
  setLook: vi.fn(),
  selectedRoomId: null,
  showLabels: true,
  showCeilings: false,
  doorsOpen: false,
  showExterior: true,
  showSite: true,
  quality: "balanced",
  siteEditId: "site",
  isMac: true,
  setUi: vi.fn(),
  updateRoom: vi.fn(),
  setSettings: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  dispatch: vi.fn(),
  savedViews: [],
  saveView: vi.fn(),
  goToView: vi.fn(),
  ...over,
});

describe("fuzzyScore", () => {
  it("matches prefixes, words in any order and subsequences, ignoring case", () => {
    expect(fuzzyScore("bed 2", "Go to Bedroom 2 · First floor")).toBeGreaterThan(0);
    expect(fuzzyScore("2 BED", "Go to Bedroom 2")).toBeGreaterThan(0);
    expect(fuzzyScore("bdrm", "Bedroom")).toBeGreaterThan(0);
    expect(fuzzyScore("xyz", "Bedroom")).toBe(0);
    expect(fuzzyScore("bed 9", "Bedroom 2")).toBe(0);
  });
  it("ranks prefixes above scattered matches", () => {
    expect(fuzzyScore("bed", "Bedroom")).toBeGreaterThan(fuzzyScore("bed", "Cupboard exterior"));
  });
});

describe("saved views", () => {
  it("offers saving only in 3D, and going to a view from any tab", () => {
    expect(buildCommands(ctx()).some((x) => x.id === "camera:save")).toBe(false);
    const c = ctx({ tab: "3d", savedViews: [{ id: "v1", name: "Kitchen from the garden" }] });
    buildCommands(c).find((x) => x.id === "camera:save")!.run();
    expect(c.saveView).toHaveBeenCalled();
    const plan = ctx({ savedViews: [{ id: "v1", name: "Kitchen from the garden" }] });
    const go = buildCommands(plan).find((x) => x.id === "savedview:v1")!;
    expect(go.title).toBe("Go to view: Kitchen from the garden");
    go.run();
    expect(plan.goToView).toHaveBeenCalledWith("v1");
    expect(rankCommands("kitchen garden", buildCommands(plan))[0].id).toBe("savedview:v1");
  });
});

describe("buildCommands", () => {
  it("offers a go-to command per room that selects it", () => {
    const c = ctx();
    const cmd = buildCommands(c).find((x) => x.title === "Go to Bedroom 2 · First floor")!;
    cmd.run();
    expect(c.setUi).toHaveBeenCalledWith({ tab: "plan", editFloorId: "f", selectedRoomId: "r2" });
  });
  it("offers adding a piece of furniture I own, in Furnish", () => {
    const c = ctx();
    buildCommands(c).find((x) => x.id === "my-furniture-add")!.run();
    expect(c.setMode).toHaveBeenCalledWith("furnish");
    expect(c.dispatch).toHaveBeenCalledWith("house:add-piece", {});
  });
  it("only offers camera commands in 3D, and titles toggles by state", () => {
    expect(buildCommands(ctx()).some((x) => x.id.startsWith("camera:"))).toBe(false);
    const c = ctx({ tab: "3d" });
    const cmds = buildCommands(c);
    cmds.find((x) => x.title === "Look at the front")!.run();
    expect(c.dispatch).toHaveBeenCalledWith("house:view", { side: "front" });
    expect(cmds.some((x) => x.title === "Hide labels")).toBe(true);
    expect(cmds.some((x) => x.title === "Show ceilings")).toBe(true);
  });
  it("offers layout switches and comparisons only when both layouts exist", () => {
    expect(buildCommands(ctx()).some((x) => x.title.startsWith("Compare") || x.title.startsWith("Switch"))).toBe(false);
    const both = buildCommands(ctx({ variants: { current: model, proposed: model } }));
    expect(both.some((x) => x.title === "Switch to Proposed")).toBe(true);
    expect(both.some((x) => x.title === "Switch to As listed")).toBe(false);
    expect(both.some((x) => x.title === "Compare: Overlay")).toBe(true);
  });
  it("offers room finish and paint only with a selected room, through updateRoom", () => {
    expect(buildCommands(ctx()).some((x) => x.title.startsWith("Floor finish"))).toBe(false);
    const c = ctx({ selectedRoomId: "r2" });
    const cmds = buildCommands(c);
    cmds.find((x) => x.title.toLowerCase().startsWith("floor finish: herringbone"))!.run();
    expect(c.updateRoom).toHaveBeenCalledWith("current", "f", "r2", { floorFinish: "herringbone" });
    cmds.find((x) => x.title === "Paint walls: Sage green")!.run();
    expect(c.updateRoom).toHaveBeenCalledWith("current", "f", "r2", { wallPaint: "#9aad93" });
  });
  it("uses Ctrl hints off a Mac", () => {
    expect(buildCommands(ctx({ isMac: false })).find((x) => x.id === "edit:undo")!.hint).toBe("Ctrl+Z");
    expect(buildCommands(ctx()).find((x) => x.id === "edit:redo")!.hint).toBe("⌘⇧Z");
  });
});

describe("rankCommands", () => {
  it("finds a room by partial name and respects the limit", () => {
    const cmds = buildCommands(ctx());
    expect(rankCommands("bed 2", cmds, 5)[0].title).toContain("Bedroom 2");
    expect(rankCommands("", cmds, 3)).toHaveLength(3);
  });
  const both = () => buildCommands(ctx({ variants: { current: model, proposed: model } }));
  it("short queries match prefixes only, not scattered letters", () => {
    const titles = rankCommands("bed", both(), 30).map((c) => c.title);
    expect(titles).toContain("Go to Bedroom 2 · First floor");
    expect(titles).not.toContain("Render quality: Balanced");
    expect(titles).not.toContain("Compare: Side by side");
  });
  it("still finds a longer prefix, and ranks a word match above a subsequence hit", () => {
    expect(rankCommands("balan", both(), 30).map((c) => c.title)).toContain("Render quality: Balanced");
    expect(rankCommands("kitc", both(), 30)[0].title).toBe("Go to Kitchen · Ground floor");
  });
  it("scores a subsequence at 10", () => {
    expect(fuzzyScore("bdrm", "Bedroom")).toBe(10);
  });
});

describe("studio commands", () => {
  it("offers every mode, Wipe, the Plot site plan and the other look", () => {
    const c = ctx({ variants: { current: model, proposed: model } });
    const cmds = buildCommands(c);
    cmds.find((x) => x.title === "Mode: Review")!.run();
    expect(c.setMode).toHaveBeenCalledWith("review");
    expect(["Mode: Build", "Mode: Decorate", "Mode: Furnish", "Mode: Plot", "Compare: Wipe", "3D", "Plan", "Look: Glass"].every((t) => cmds.some((x) => x.title === t))).toBe(true);
    expect(cmds.some((x) => x.title === "Look: Studio")).toBe(false);
    cmds.find((x) => x.title === "Look: Glass")!.run();
    expect(c.setLook).toHaveBeenCalledWith("glass");
    cmds.find((x) => x.title === "Site plan (Plot)")!.run();
    expect(c.setMode).toHaveBeenCalledWith("plot");
    expect(c.setUi).toHaveBeenCalledWith({ tab: "plan" });
    expect(buildCommands(ctx({ look: "glass" })).some((x) => x.title === "Look: Studio")).toBe(true);
  });

  it("has canvas and photo pin commands that write the panel preferences", () => {
    const cmds = buildCommands(ctx({}));
    cmds.find((x) => x.title === "Canvas: Full")!.run();
    expect(usePanelPrefs.getState().quiet).toBe(false);
    cmds.find((x) => x.title === "Canvas: Quiet")!.run();
    expect(usePanelPrefs.getState().quiet).toBe(true);
    usePanelPrefs.getState().setPrefs({ showPins: false });
    buildCommands(ctx({})).find((x) => x.title === "Photo pins: show")!.run();
    expect(usePanelPrefs.getState().showPins).toBe(true);
    expect(buildCommands(ctx({})).some((x) => x.title === "Photo pins: hide")).toBe(true);
    usePanelPrefs.getState().setPrefs({ showPins: false });
  });
});

describe("section cut commands", () => {
  it("offers a cut per floor and an off switch", () => {
    const setUi = vi.fn();
    const cmds = buildCommands(ctx({ setUi }));
    const first = cmds.find((x) => x.id === "section:f:floor");
    expect(first?.title).toBe("Section cut: First floor");
    first?.run();
    expect(setUi).toHaveBeenCalledWith({ tab: "3d", sectionHeight: expect.any(Number) });
    expect(cmds.some((x) => x.id === "section:off")).toBe(true);
  });
});
