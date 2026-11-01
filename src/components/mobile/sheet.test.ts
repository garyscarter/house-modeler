import { beforeEach, describe, expect, it } from "vitest";
import { restingDetent, useSheet } from "./sheet";
import { useStore } from "../../store";
import { useChassis } from "../useChassis";

const phone = (mode: "build" | "decorate" | "furnish" | "electrics") => {
  useChassis.setState({ compact: true, chassis: "phone" });
  useStore.setState({ mode });
};

describe("sheet", () => {
  beforeEach(() => useSheet.setState({ detent: "peek", held: false }));

  it("rests hidden only in a view-only mode with nothing selected", () => {
    expect(restingDetent(true, false)).toBe("hidden");
    expect(restingDetent(true, true)).toBe("peek");
    expect(restingDetent(false, false)).toBe("peek");
  });

  it("view-only modes: a pick shows the peek line, not half; clearing hides it", () => {
    phone("build");
    useSheet.getState().lower();
    expect(useSheet.getState().detent).toBe("hidden");
    useSheet.getState().raise();
    expect(useSheet.getState().detent).toBe("peek");
    useSheet.getState().lower();
    expect(useSheet.getState().detent).toBe("hidden");
  });

  it("Decorate and Furnish keep peek and half", () => {
    phone("furnish");
    useSheet.getState().lower();
    expect(useSheet.getState().detent).toBe("peek");
    useSheet.getState().raise();
    expect(useSheet.getState().detent).toBe("half");
  });

  it("tapping the active tab toggles the panel between half and rest", () => {
    phone("electrics");
    useSheet.getState().lower();
    useSheet.getState().toggle();
    expect(useSheet.getState().detent).toBe("half");
    useSheet.getState().toggle();
    expect(useSheet.getState().detent).toBe("hidden");
  });

  it("iPad portrait (not compact) never hides the sheet", () => {
    useChassis.setState({ compact: false, chassis: "phone" });
    useStore.setState({ mode: "build" });
    useSheet.getState().lower();
    expect(useSheet.getState().detent).toBe("peek");
  });

  it("rest() keeps a stored selection held, so a remount does not hide its sheet", () => {
    phone("build");
    useStore.setState({ selectedRoomId: "r1", gardenSel: [] });
    useSheet.getState().rest();
    expect(useSheet.getState()).toMatchObject({ held: true, detent: "peek" });
    useStore.setState({ selectedRoomId: null });
    useSheet.getState().rest();
    expect(useSheet.getState()).toMatchObject({ held: false, detent: "hidden" });
  });
});
