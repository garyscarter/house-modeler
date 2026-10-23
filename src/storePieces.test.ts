import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { listing91770873 } from "./lib/houses/listing91770873";

const st = () => useStore.getState();
const fixturesOf = (k: "current" | "proposed") => st().variants[k]!.floors.flatMap((f) => f.fixtures ?? []);

describe("store: my furniture", () => {
  beforeEach(() => {
    useStore.setState({ variants: {}, sites: {}, photos: [], pieces: [], past: [], future: [] });
    st().setVariant("current", listing91770873(""));
    st().copyVariant("current", "proposed");
  });

  function place() {
    const id = st().addPiece({ name: "Our sofa", kind: "sofa-3", w: 2.31, d: 0.95, h: 0.8 });
    for (const k of ["current", "proposed"] as const) {
      st().updateFloor(k, st().variants[k]!.floors[0].id, (f) => ({
        ...f,
        fixtures: [...(f.fixtures ?? []), { id: `fx-${k}`, type: "sofa-3", x: 10, y: 10, rot: 0, piece: id, w: 2.31, d: 0.95, h: 0.8, label: "Our sofa" }],
      }));
    }
    useStore.setState({ past: [], future: [] });
    return id;
  }

  it("updatePiece changes pieces and both layouts in one undo step", async () => {
    const id = place();
    st().updatePiece(id, { w: 1.8 });
    expect(st().pieces[0].w).toBe(1.8);
    expect(fixturesOf("current").find((f) => f.piece === id)!.w).toBe(1.8);
    expect(fixturesOf("proposed").find((f) => f.piece === id)!.w).toBe(1.8);
    expect(st().past.length).toBe(1);
    st().undo();
    expect(st().pieces[0].w).toBe(2.31);
    expect(fixturesOf("current").find((f) => f.piece === id)!.w).toBe(2.31);
    expect(fixturesOf("proposed").find((f) => f.piece === id)!.w).toBe(2.31);
  });

  it("removePiece unlinks placements and reset keeps pieces", () => {
    const id = place();
    st().removePiece(id);
    expect(st().pieces).toHaveLength(0);
    const f = fixturesOf("current").find((x) => x.id === "fx-current")!;
    expect(f.piece).toBeUndefined();
    expect(f.label).toBe("Our sofa");
    st().addPiece({ name: "Bed", kind: "custom", w: 1, d: 2, h: 0.5 });
    st().reset();
    expect(st().pieces).toHaveLength(1);
  });
});
