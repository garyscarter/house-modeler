import { describe, expect, it } from "vitest";
import { floor, rect } from "../../lib/testing";
import type { Fixture, HouseModel } from "../../types";
import { pruneDeleted, toggleLinkInModel } from "./linking";

const fx = (id: string, type: string, extra: Partial<Fixture> = {}): Fixture => ({ id, type, x: 100, y: 100, rot: 0, ...extra });
const ground = floor([rect("Kitchen", 0, 0, 400, 300)], [], { fixtures: [fx("sw", "switch-1g", { controls: ["k1"] }), fx("k1", "pendant"), fx("k2", "pendant")] });
const model: HouseModel = { floors: [ground], ceilingHeight: 2.4, slabThickness: 0.25, circuits: [{ id: "c", name: "Lights", kind: "lighting", points: ["k1", "k2", "sw"] }] };

describe("toggleLinkInModel", () => {
  it("links a light to the switch and unlinks it again, dropping an empty list", () => {
    const on = toggleLinkInModel(model, "sw", "k2");
    expect(on.floors[0].fixtures!.find((x) => x.id === "sw")!.controls).toEqual(["k1", "k2"]);
    const off = toggleLinkInModel(toggleLinkInModel(on, "sw", "k2"), "sw", "k1");
    expect(off.floors[0].fixtures!.find((x) => x.id === "sw")!.controls).toBeUndefined();
  });
  it("returns the same model for an unknown switch", () => {
    expect(toggleLinkInModel(model, "nope", "k1")).toBe(model);
  });
});

describe("pruneDeleted", () => {
  it("drops controls and circuit points that name deleted fixtures", () => {
    const gone: HouseModel = { ...model, floors: [{ ...ground, fixtures: ground.fixtures!.filter((x) => x.id !== "k1") }] };
    const out = pruneDeleted(gone);
    expect(out.floors[0].fixtures!.find((x) => x.id === "sw")!.controls).toBeUndefined();
    expect(out.circuits![0].points).toEqual(["k2", "sw"]);
  });
  it("is a no-op for a model with nothing dangling", () => {
    expect(pruneDeleted(model)).toBe(model);
  });
});
