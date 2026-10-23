import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { listing91770873 } from "./lib/houses/listing91770873";

const st = () => useStore.getState();

describe("store: modes", () => {
  beforeEach(() => {
    useStore.setState({ variants: {}, sites: {}, photos: [], past: [], future: [], mode: "build", tab: "3d", editFloorId: null, floorBeforeSite: null, selectedRoomId: null, selectedEdge: null });
  });

  it("setMode adds no undo step and applies the switch rules", () => {
    st().setVariant("current", listing91770873(""));
    const before = st().past.length;
    st().setUi({ selectedRoomId: "r", selectedEdge: { edge: 1, side: "inside" } });
    st().setMode("decorate");
    expect(st().mode).toBe("decorate");
    expect(st().selectedRoomId).toBe("r");
    st().setMode("furnish");
    expect(st().selectedRoomId).toBeNull();
    expect(st().selectedEdge).toBeNull();
    expect(st().past.length).toBe(before);
  });

  it("Plot on the plan opens the site and Build restores the floor", () => {
    st().setUi({ tab: "plan", editFloorId: "f1" });
    st().setMode("plot");
    expect(st().editFloorId).toBe("site");
    st().setMode("build");
    expect(st().editFloorId).toBe("f1");
  });

  it("undo, redo and reset clear selectedEdge", () => {
    st().setVariant("current", listing91770873(""));
    st().updateModel("current", { ceilingHeight: 2.5 });
    st().setUi({ selectedEdge: { edge: 0, side: "outside" } });
    st().undo();
    expect(st().selectedEdge).toBeNull();
    st().setUi({ selectedEdge: { edge: 0, side: "outside" } });
    st().redo();
    expect(st().selectedEdge).toBeNull();
    st().setUi({ selectedEdge: { edge: 0, side: "outside" } });
    st().reset();
    expect(st().selectedEdge).toBeNull();
  });

  it("a persisted state without mode, or with an unknown one, loads as build", () => {
    const merge = useStore.persist.getOptions().merge!;
    const current = st();
    expect(merge({ settings: { quality: "low" } }, current).mode).toBe("build");
    expect(merge({ mode: "bogus" }, { ...current, mode: "review" }).mode).toBe("build");
    expect(merge({ mode: "plot" }, current).mode).toBe("plot");
    expect(merge(undefined, current).mode).toBe("build");
  });

  it("persists the mode but not the selection", () => {
    const partialize = useStore.persist.getOptions().partialize!;
    const p = partialize({ ...st(), mode: "furnish", selectedEdge: { edge: 1, side: "inside" } }) as Record<string, unknown>;
    expect(p.mode).toBe("furnish");
    expect("selectedEdge" in p).toBe(false);
  });

  it("setUi clears selectedEdge when the room changes unless an edge is given", () => {
    st().setUi({ selectedRoomId: "a", selectedEdge: { edge: 2, side: "inside" } });
    st().setUi({ selectedRoomId: "a" });
    expect(st().selectedEdge).toEqual({ edge: 2, side: "inside" });
    st().setUi({ selectedRoomId: "b" });
    expect(st().selectedEdge).toBeNull();
    st().setUi({ selectedRoomId: "c", selectedEdge: { edge: 1, side: "outside" } });
    expect(st().selectedEdge).toEqual({ edge: 1, side: "outside" });
  });
});
