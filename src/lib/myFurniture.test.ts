import { describe, expect, it } from "vitest";
import type { Floor, HouseModel, MyPiece } from "../types";
import { byId, CATALOGUE, filterCatalogue, MINE } from "./catalogue";
import { applyPiece, pieceFixtureFields, pieceItem, pieceWhereabouts, sanitizePieces, unlinkPiece, whereaboutsLine } from "./myFurniture";

const piece: MyPiece = { id: "p1", name: "Our sofa", kind: "sofa-3", w: 2.31, d: 0.95, h: 0.8 };

const floor = (id: string, name: string, fixtures: Floor["fixtures"]): Floor =>
  ({
    id,
    name,
    level: 0,
    image: "",
    pxPerM: 100,
    rooms: [{ id: "r1", name: "Lounge", polygon: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }, { x: 0, y: 500 }] }],
    fixtures,
  }) as unknown as Floor;

const model = (floors: Floor[]): HouseModel => ({ floors, ceilingHeight: 2.4, slabThickness: 0.2 }) as unknown as HouseModel;

const placed = (over: object = {}) => ({ id: "f1", type: "sofa-3", x: 100, y: 100, rot: 0, piece: "p1", w: 2.31, d: 0.95, h: 0.8, label: "Our sofa", ...over });

describe("my furniture", () => {
  it("pieceItem uses the base look with the measured size, and custom for an unknown kind", () => {
    const it1 = pieceItem(piece);
    expect(it1.id).toBe("sofa-3");
    expect(it1.category).toBe(MINE);
    expect([it1.w, it1.d, it1.h, it1.name, it1.piece]).toEqual([2.31, 0.95, 0.8, "Our sofa", "p1"]);
    expect(it1.color).toBe(byId("sofa-3")!.color);
    expect(pieceItem({ ...piece, kind: "nope" }).id).toBe("custom");
  });

  it("pieceFixtureFields is empty for catalogue items", () => {
    expect(pieceFixtureFields(CATALOGUE[0])).toEqual({});
    expect(pieceFixtureFields(pieceItem(piece))).toMatchObject({ piece: "p1", w: 2.31, label: "Our sofa" });
  });

  it("applyPiece updates every floor, keeps a custom label, and is identity with no match", () => {
    const m = model([floor("a", "Ground", [placed(), placed({ id: "f2", label: "Mum's seat" })]), floor("b", "First", [placed({ id: "f3" })])]);
    const next = { ...piece, name: "Big sofa", w: 1.8 };
    const out = applyPiece(m, piece, next);
    expect(out.floors[0].fixtures!.map((x) => x.w)).toEqual([1.8, 1.8]);
    expect(out.floors[1].fixtures![0].w).toBe(1.8);
    expect(out.floors[0].fixtures!.map((x) => x.label)).toEqual(["Big sofa", "Mum's seat"]);
    expect(applyPiece(m, piece, { ...next, id: "zzz" })).toBe(m);
  });

  it("unlinkPiece removes the link and keeps the label", () => {
    const m = model([floor("a", "Ground", [placed()])]);
    const out = unlinkPiece(m, "p1");
    expect(out.floors[0].fixtures![0].piece).toBeUndefined();
    expect(out.floors[0].fixtures![0].label).toBe("Our sofa");
    expect(unlinkPiece(m, "other")).toBe(m);
  });

  it("sanitizePieces drops junk, clamps sizes and defaults unknown kinds", () => {
    expect(sanitizePieces("x")).toBeUndefined();
    expect(sanitizePieces(undefined)).toBeUndefined();
    const out = sanitizePieces([null, { name: "no id" }, { id: "a" }, { id: "b", name: "Huge", kind: "weird", w: 99, d: 0, h: 1 }])!;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "b", kind: "custom", w: 10, d: 0.02, h: 1 });
  });

  it("pieceWhereabouts counts per layout with the room name", () => {
    const cur = model([floor("a", "Ground", [placed(), placed({ id: "f2", x: 900, y: 900 })])]);
    const prop = model([floor("a", "Ground", [])]);
    const w = pieceWhereabouts({ current: cur, proposed: prop }, [piece, { ...piece, id: "p2" }]);
    expect(w.p1.current).toEqual({ count: 2, places: ["Lounge, Ground", "Ground"] });
    expect(w.p1.proposed!.count).toBe(0);
    expect(w.p2.current!.count).toBe(0);
    expect(pieceWhereabouts({ current: cur }, [piece]).p1.proposed).toBeUndefined();
    expect([0, 1, 2].map(whereaboutsLine)).toEqual(["Not placed", "Placed", "Placed 2 times"]);
  });

  it("filterCatalogue searches extra items and the Mine category", () => {
    const extra = [pieceItem(piece)];
    expect(filterCatalogue("our", "All", extra)[0].piece).toBe("p1");
    expect(filterCatalogue("", MINE, extra)).toHaveLength(1);
    expect(filterCatalogue("", MINE)).toHaveLength(0);
  });
});
