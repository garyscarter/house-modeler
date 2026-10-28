import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { builtInHouse } from "./houses/default";

const st = () => useStore.getState();
const merge = (persisted: unknown) => useStore.persist.getOptions().merge!(persisted, st()) as unknown as Record<string, unknown>;

describe("store: studio", () => {
  beforeEach(() => {
    useStore.setState({ variants: {}, sites: {}, photos: [], past: [], future: [], mode: "build", modeBeforeReview: null, tab: "3d", editFloorId: null, activeVariant: "current", viewMode: "single", peek: false, peekReturn: null, hoveredRoomId: null });
  });

  it("Review remembers the mode it came from and leaveReview goes back", () => {
    st().setMode("decorate");
    st().setMode("review");
    expect(st().modeBeforeReview).toBe("decorate");
    st().leaveReview();
    expect(st().mode).toBe("decorate");
    expect(st().modeBeforeReview).toBeNull();
  });

  it("leaveReview without a remembered mode lands on Build", () => {
    useStore.setState({ mode: "review", modeBeforeReview: null });
    st().leaveReview();
    expect(st().mode).toBe("build");
  });

  it("re-entering Review from Review keeps the original mode", () => {
    st().setMode("furnish");
    st().setMode("review");
    st().setMode("review");
    expect(st().modeBeforeReview).toBe("furnish");
  });

  it("persisted merge falls back for bad values", () => {
    const m = merge({ viewMode: "bogus", tab: "sideways", editFloorId: "site", mode: "build", modeBeforeReview: "review" });
    expect(m.viewMode).toBe("single");
    expect(m.tab).toBe("3d");
    expect(m.editFloorId).toBeNull();
    expect(m.modeBeforeReview).toBeNull();
    expect(merge({ modeBeforeReview: "nope" }).modeBeforeReview).toBeNull();
  });

  it("persisted merge keeps good values, and the site id in Plot", () => {
    const m = merge({ viewMode: "wipe", tab: "plan", editFloorId: "f2", mode: "decorate", modeBeforeReview: "furnish" });
    expect([m.viewMode, m.tab, m.editFloorId, m.modeBeforeReview]).toEqual(["wipe", "plan", "f2", "furnish"]);
    expect(merge({ editFloorId: "site", mode: "plot" }).editFloorId).toBe("site");
  });

  it("setPeek swaps the layout without an undo step, and only when both exist", () => {
    st().setVariant("current", builtInHouse(""));
    st().setPeek(true);
    expect(st().peek).toBe(false);
    st().setVariant("proposed", builtInHouse(""));
    st().setUi({ activeVariant: "proposed" });
    const before = st().past.length;
    st().setPeek(true);
    expect(st().peek).toBe(true);
    expect(st().activeVariant).toBe("current");
    st().setPeek(false);
    expect(st().peek).toBe(false);
    expect(st().activeVariant).toBe("proposed");
    expect(st().past.length).toBe(before);
  });

  it("undo clears the hovered room, and the image defaults to 30%", () => {
    st().setVariant("current", builtInHouse(""));
    st().setUi({ hoveredRoomId: "x" });
    st().undo();
    expect(st().hoveredRoomId).toBeNull();
    expect(useStore.getInitialState().planImage).toEqual({ show: true, opacity: 0.3 });
  });
});
