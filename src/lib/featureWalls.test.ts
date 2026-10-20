import { describe, expect, it } from "vitest";
import type { Opening, Room } from "../types";
import { buildWalls, cutWall, roomWorldPolygon } from "./geometry";
import { edgeLabel, edgeSpans, insertCorner, isOutsideEdge, removeCorner, setOutsideOverride, setWallOverride, spansByEdge } from "./featureWalls";
import { sideSpans, wallEnds, wallFaces, wallThickness } from "./walls";
import { interiorFinish, outsideLook, wallLook } from "./wallCovering";
import { floor, rect } from "./testing";
import { listing91770873 } from "./houses/listing91770873";

/** A 3 m x 4 m room in a 1 px = 1 cm floor, as world metres. */
const square = [
  { x: 0, y: 0 },
  { x: 3, y: 0 },
  { x: 3, y: 4 },
  { x: 0, y: 4 },
];

describe("edgeSpans", () => {
  it("finds the edge a wall runs along, whichever way round", () => {
    expect(edgeSpans({ a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }, square)).toEqual([{ edge: 0, t0: 0, t1: 3 }]);
    expect(edgeSpans({ a: { x: 3, y: 4 }, b: { x: 3, y: 0 } }, square)).toEqual([{ edge: 1, t0: 0, t1: 4 }]);
  });

  it("covers only the overlap when the wall runs on past the room", () => {
    // A wall merged from this room's rear edge and the next room's.
    expect(edgeSpans({ a: { x: -2, y: 0 }, b: { x: 6, y: 0 } }, square)).toEqual([{ edge: 0, t0: 2, t1: 5 }]);
  });

  it("allows for walls merged a little off the traced line, but not a parallel wall across the room", () => {
    expect(edgeSpans({ a: { x: 0, y: 0.15 }, b: { x: 3, y: 0.15 } }, square).map((s) => s.edge)).toEqual([0]);
    expect(edgeSpans({ a: { x: 0, y: 1 }, b: { x: 3, y: 1 } }, square)).toEqual([]);
    expect(edgeSpans({ a: { x: 4, y: 0 }, b: { x: 6, y: 0 } }, square)).toEqual([]);
  });

  it("splits a wall across collinear edges either side of a corner", () => {
    const poly = [{ x: 0, y: 0 }, { x: 1.5, y: 0 }, ...square.slice(1)];
    expect(edgeSpans({ a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }, poly)).toEqual([
      { edge: 0, t0: 0, t1: 1.5 },
      { edge: 1, t0: 1.5, t1: 3 },
    ]);
  });

  it("gives an overlap to the nearer of two parallel edges", () => {
    // A notch 0.1 m deep: both edges are within tolerance of the wall line.
    const poly = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.1 },
      { x: 3, y: 0.1 },
      { x: 3, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(edgeSpans({ a: { x: 0, y: 0.1 }, b: { x: 3, y: 0.1 } }, poly)).toEqual([
      { edge: 0, t0: 0, t1: 1 },
      { edge: 2, t0: 1, t1: 3 },
    ]);
  });
});

describe("spansByEdge", () => {
  const seg = { a: { x: 0, y: 0 }, b: { x: 6, y: 0 } };
  it("tags each room's stretch with its edge and leaves rooms without feature walls alone", () => {
    const spans = [
      { t0: 0, t1: 3, roomId: "A" },
      { t0: 3, t1: 6, roomId: "B" },
    ];
    expect(spansByEdge(seg, spans, (id) => (id === "A" ? square : undefined))).toEqual([
      { t0: 0, t1: 3, roomId: "A", edge: 0 },
      { t0: 3, t1: 6, roomId: "B" },
    ]);
  });

  it("keeps the stretch of a room that runs along none of its edges untagged", () => {
    const spans = [{ t0: 0, t1: 6, roomId: "A" }];
    expect(spansByEdge(seg, spans, () => square)).toEqual([
      { t0: 0, t1: 3, roomId: "A", edge: 0 },
      { t0: 3, t1: 6, roomId: "A" },
    ]);
    expect(spansByEdge(seg, [{ t0: 0, t1: 6, roomId: null }], () => square)).toEqual([{ t0: 0, t1: 6, roomId: null }]);
  });
});

describe("feature walls in the built shell", () => {
  // Two rooms side by side with a door in the shared wall; A's right-hand wall (edge 1) is brick.
  const door: Opening = { id: "d", kind: "door", x: 300, y: 200, orientation: "v", widthM: 0.8 };
  const a = rect("A", 0, 0, 300, 400, { wallCovering: "stripe", wallFinishes: { 1: { covering: "brick" } } });
  const f = floor([a, rect("B", 300, 0, 600, 400)], [door]);
  const rooms = f.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(f, r) }));
  const walls = buildWalls(f);
  const thick = walls.map(wallThickness);
  const ends = wallEnds(walls, thick);
  const quads = walls.flatMap((wall, i) => {
    const { pieces, placements } = cutWall(wall, 2.4);
    const spans = ([1, -1] as const).map((s) => spansByEdge(wall, sideSpans(wall, s, thick[i] / 2 + 0.08, rooms), (id) => (id === "A" ? rooms[0].poly : undefined)));
    return wallFaces({ wall, thickness: thick[i], ends: ends[i], spans: [spans[0], spans[1]], pieces, bands: [], placements, top: 2.4, baseY: 0, skirting: true }).quads;
  });
  const insideA = quads.flatMap((q) => (q.slot.kind === "inside" && q.slot.roomId === "A" ? [{ q, edge: q.slot.edge }] : []));

  it("tags every inside face of the room with the edge it lies on, door pieces and jambs included", () => {
    const onShared = insideA.filter(({ q }) => q.v.every((v) => Math.abs(v[0] - (3 - 0.05)) < 1e-6));
    // Two side pieces, the lintel and a jamb face at each side of the door.
    expect(onShared.length).toBeGreaterThanOrEqual(3);
    expect(onShared.every(({ edge }) => edge === 1)).toBe(true);
    const rear = insideA.filter(({ q }) => q.v.every((v) => Math.abs(v[2] - 0.125) < 1e-6));
    expect(rear.length).toBeGreaterThan(0);
    expect(rear.every(({ edge }) => edge === 0)).toBe(true);
  });

  it("gives those faces the wall's own finish and the rest the room's", () => {
    expect(interiorFinish(a, undefined, 1)).toMatchObject({ covering: "brick" });
    expect(interiorFinish(a, undefined, 0)).toMatchObject({ covering: "stripe" });
    // The neighbour's side of the same wall keeps its own paint.
    const b = quads.filter((q) => q.slot.kind === "inside" && q.slot.roomId === "B");
    expect(b.every((q) => q.slot.kind === "inside" && q.slot.edge === undefined)).toBe(true);
  });
});

describe("wallLook", () => {
  const room = rect("A", 0, 0, 300, 300, { wallCovering: "stripe", wallPaint: "#efe8da", wallAccent: "#cdc1ab" });
  it("starts a different covering from its own defaults", () => {
    const look = wallLook({ ...room, wallFinishes: { 1: { covering: "brick" } } }, 1);
    expect(look).toEqual({ wallCovering: "brick", wallPaint: undefined, wallAccent: undefined });
  });

  it("recolours the room's covering when only colours are set", () => {
    expect(wallLook({ ...room, wallFinishes: { 2: { accent: "#ff0000" } } }, 2)).toEqual({ wallCovering: "stripe", wallPaint: "#efe8da", wallAccent: "#ff0000" });
  });

  it("ignores overrides on edges the room does not have, and faces matched to no edge", () => {
    const r = { ...room, wallFinishes: { 9: { covering: "brick" as const } } };
    expect(interiorFinish(r, undefined, 9)).toMatchObject({ covering: "stripe" });
    expect(interiorFinish(r, undefined, undefined)).toMatchObject({ covering: "stripe" });
  });
});

describe("corner edits", () => {
  const room: Room = rect("A", 0, 0, 300, 400, { wallFinishes: { 0: { covering: "brick" }, 2: { covering: "floral" } } });

  it("splits an edge into two halves that keep its finish, moving later edges up", () => {
    const r = insertCorner(room, 0, { x: 150, y: 0 });
    expect(r.polygon).toHaveLength(5);
    expect(r.wallFinishes).toEqual({ 0: { covering: "brick" }, 1: { covering: "brick" }, 3: { covering: "floral" } });
  });

  it("joins the edges either side of a removed corner, keeping the first one's finish", () => {
    const five = { ...room, ...insertCorner(room, 0, { x: 150, y: 0 }) };
    expect(removeCorner(five, 1)).toEqual({ polygon: room.polygon, wallFinishes: room.wallFinishes });
    // Removing corner 2 joins edges 1 (brick) and 2 (plain) into edge 1.
    expect(removeCorner(five, 2).wallFinishes).toEqual({ 0: { covering: "brick" }, 1: { covering: "brick" }, 2: { covering: "floral" } });
  });

  it("wraps round at the first corner and keeps the following edge's finish when the first has none", () => {
    // Corner 0 joins edges 3 (plain) and 0 (brick) into the new last edge.
    const r = removeCorner(room, 0);
    expect(r.polygon).toEqual(room.polygon.slice(1));
    expect(r.wallFinishes).toEqual({ 1: { covering: "floral" }, 2: { covering: "brick" } });
  });

  it("clears to nothing and drops edges that are out of range", () => {
    expect(setWallOverride({ ...room, wallFinishes: { 0: { covering: "brick" } } }, 0, null)).toBeUndefined();
    expect(setWallOverride({ ...room, wallFinishes: { 7: { covering: "brick" } } }, 1, { covering: "tiles" })).toEqual({ 1: { covering: "tiles" } });
  });
});

describe("edgeLabel", () => {
  const f = floor([rect("Kitchen", 0, 0, 300, 400), rect("Living room", 300, 0, 600, 400)]);
  const k = f.rooms[0];
  it("names the room on the other side", () => {
    expect(edgeLabel(f, k, 1)).toBe("to Living room");
  });

  it("says which side of the house an outside wall is on, or which way it faces", () => {
    expect(edgeLabel(f, k, 0)).toBe("outside, rear");
    expect(edgeLabel(f, k, 3)).toBe("outside, left");
    expect(edgeLabel(f, k, 2)).toBe("outside, front");
    // The front faces south: the rear wall faces north, the left wall west.
    expect(edgeLabel(f, k, 0, 180)).toBe("outside, faces north");
    expect(edgeLabel(f, k, 3, 180)).toBe("outside, faces west");
  });
});

describe("the listing's feature walls", () => {
  const ground = listing91770873("").floors[0];
  const where = (name: string) => {
    const room = ground.rooms.find((r) => r.name === name)!;
    return Object.entries(room.wallFinishes ?? {}).map(([k, o]) => `${o.covering} ${edgeLabel(ground, room, Number(k))}`);
  };

  it("sit where the photos put them", () => {
    expect(where("Living Room (rear)")).toEqual(["rose outside, right"]);
    expect(where("Kitchen (galley)")).toEqual(["brick to Garage"]);
    expect(where("Kitchen")).toEqual(["brick outside, rear", "brick to Garage"]);
    expect(where("Hallway (stairs)")).toEqual(["trail to Hallway (front)"]);
  });
});

describe("outside finishes of single walls", () => {
  const room: Room = rect("A", 0, 0, 300, 400, { wallFinishes: { 0: { covering: "brick" } } });

  it("keeps the inside covering when the outside is set or cleared, and the other way round", () => {
    const withOut = setOutsideOverride(room, 0, { finish: "render" });
    expect(withOut).toEqual({ 0: { covering: "brick", outside: { finish: "render" } } });
    expect(setWallOverride({ ...room, wallFinishes: withOut }, 0, { covering: "tiles" })).toEqual({ 0: { covering: "tiles", outside: { finish: "render" } } });
    expect(setOutsideOverride({ ...room, wallFinishes: withOut }, 0, null)).toEqual({ 0: { covering: "brick" } });
  });

  it("drops an override left with nothing in it", () => {
    const only = { ...room, wallFinishes: { 1: { outside: { finish: "render" as const } } } };
    expect(setWallOverride(only, 1, null)).toEqual({ 1: { outside: { finish: "render" } } });
    expect(setOutsideOverride(only, 1, null)).toBeUndefined();
    expect(setOutsideOverride(room, 2, { color: "#ffffff" })).toEqual({ 0: { covering: "brick" }, 2: { outside: { color: "#ffffff" } } });
  });

  it("follows the corners when they are added or removed", () => {
    const r = { ...room, wallFinishes: { 1: { outside: { finish: "render" as const } } } };
    expect(insertCorner(r, 0, { x: 150, y: 0 }).wallFinishes).toEqual({ 2: { outside: { finish: "render" } } });
    expect(insertCorner(r, 1, { x: 300, y: 200 }).wallFinishes).toEqual({ 1: { outside: { finish: "render" } }, 2: { outside: { finish: "render" } } });
  });

  it("tells outside walls from walls shared with another room", () => {
    const f = floor([rect("Kitchen", 0, 0, 300, 400), rect("Living room", 300, 0, 600, 400)]);
    expect(isOutsideEdge(f, f.rooms[0], 1)).toBe(false);
    expect([0, 2, 3].map((i) => isOutsideEdge(f, f.rooms[0], i))).toEqual([true, true, true]);
  });
});

describe("the listing's outside finishes", () => {
  const ground = listing91770873("").floors[0];
  const garage = ground.rooms.find((r) => r.name === "Garage")!;
  const house = { finish: "render" as const, color: "#efe9d8" };

  it("renders only the garage's front wall, where it stands back under the porch roof", () => {
    expect(edgeLabel(ground, garage, 2)).toBe("outside, front");
    const looks = garage.polygon.map((_, i) => outsideLook(garage, i, house).finish);
    expect(looks).toEqual(["brick", "brick", "render", "brick"]);
    expect(outsideLook(garage, 2, house).color).toBe(house.color);
  });

  it("tags the garage's front faces in the built shell with that edge, and nothing else", () => {
    const rooms = ground.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(ground, r) }));
    const walls = buildWalls(ground);
    const thick = walls.map(wallThickness);
    const ends = wallEnds(walls, thick);
    const polyOf = (id: string) => (id === garage.id ? rooms.find((r) => r.id === id)!.poly : undefined);
    const outside = walls
      .flatMap((wall, i) => {
        const { pieces, placements } = cutWall(wall, 2.4);
        const spans = ([1, -1] as const).map((s) => spansByEdge(wall, sideSpans(wall, s, thick[i] / 2 + 0.08, rooms), polyOf));
        return wallFaces({ wall, thickness: thick[i], ends: ends[i], spans: [spans[0], spans[1]], pieces, bands: [], placements, top: 2.4, baseY: 0, skirting: false }).quads;
      })
      .filter((q) => q.slot.kind === "outside" && q.slot.roomId === garage.id);
    expect(outside.length).toBeGreaterThan(0);
    const tagged = outside.filter((q) => q.slot.kind === "outside" && q.slot.edge === 2);
    expect(tagged.length).toBeGreaterThan(0);
    // Every tagged quad lies on the garage's front line.
    const frontZ = roomWorldPolygon(ground, garage)[2].y;
    expect(tagged.every((q) => q.v.every((v) => Math.abs(v[2] - frontZ) < 0.3))).toBe(true);
    // Faces on the other sides carry their own edge numbers, never 2.
    const others = outside.filter((q) => q.v.every((v) => Math.abs(v[2] - frontZ) > 0.5));
    expect(others.every((q) => q.slot.kind === "outside" && q.slot.edge !== 2)).toBe(true);
  });
});
