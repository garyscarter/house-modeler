import { describe, expect, it } from "vitest";
import { LAMPS, POOL, assignSlots, clusterBulbs, focusPoint, poolFor, type LampLight, type PoolSizes, type Slots, LIGHTS_AUTO_ALTITUDE, WARMTH_COLOR, bulbWorld, bulbsWorld, candela, coneGain, dimOf, floorLamps, fixtureLit, gridPoints, isLightItem, lampGlow, lightsMaster, lightsOn, litRooms, pickLights, warmthOf } from "./lights";
import { CATALOGUE, byId, dropOf } from "./catalogue";
import { fixtureBox } from "./planMath";
import { NIGHT_PRESET_ALTITUDE, nightHour } from "./dusk";
import { dayOfYear, solarPosition, sunTimes } from "./sun";
import { listingSite } from "./houses/listing91770873";
import type { Fixture, Floor } from "../types";

const site = listingSite();
const YEAR = 2026;
const fx = (type: string, extra: Partial<Fixture> = {}): Fixture => ({ id: type, type, x: 0, y: 0, rot: 0, ...extra });

describe("lightsOn", () => {
  it("on and off ignore the sun", () => {
    expect(lightsOn("on", null)).toBe(true);
    expect(lightsOn("on", 40)).toBe(true);
    expect(lightsOn("off", -10)).toBe(false);
  });
  it("auto is off by day and with the sun study off, on from dusk", () => {
    expect(lightsOn("auto", null)).toBe(false);
    expect(lightsOn("auto", 20)).toBe(false);
    expect(lightsOn("auto", LIGHTS_AUTO_ALTITUDE)).toBe(true);
    expect(lightsOn("auto", -6)).toBe(true);
  });
  it("older saves read as auto", () => {
    expect(lightsMaster({})).toBe("auto");
    expect(lightsMaster({ lights: "off" })).toBe("off");
  });
});

describe("light fixtures", () => {
  it("every catalogue lamp is a light and nothing else is", () => {
    for (const id of ["table-lamp", "table-lamp-small", "floor-lamp", "desk-lamp", "mirror-lit"]) expect(isLightItem(byId(id)!), id).toBe(true);
    for (const id of ["sofa-3", "mirror", "bed-double"]) expect(isLightItem(byId(id)!), id).toBe(false);
  });
  it("is lit when switched on (the default) and the master allows", () => {
    const lamp = byId("floor-lamp")!;
    expect(fixtureLit(fx("floor-lamp"), lamp, "on", null)).toBe(true);
    expect(fixtureLit(fx("floor-lamp", { on: false }), lamp, "on", null)).toBe(false);
    expect(fixtureLit(fx("floor-lamp"), lamp, "auto", 30)).toBe(false);
    expect(fixtureLit(fx("floor-lamp"), lamp, "auto", -5)).toBe(true);
    expect(fixtureLit(fx("sofa-3"), byId("sofa-3")!, "on", null)).toBe(false);
  });
  it("puts every bulb inside its fixture's box", () => {
    for (const [symbol, lamp] of Object.entries(LAMPS)) {
      const item = CATALOGUE.find((c) => c.symbol === symbol)!;
      const box = { w: item.w, d: item.d, h: item.h };
      const bulbs = lamp!.bulbs(box, 1.2);
      expect(bulbs.length, symbol).toBeGreaterThan(0);
      for (const [x, y, z] of bulbs) {
        expect(Math.abs(x), symbol).toBeLessThanOrEqual(box.w / 2);
        expect(y, symbol).toBeGreaterThanOrEqual(0);
        expect(y, symbol).toBeLessThanOrEqual(box.h);
        expect(Math.abs(z), symbol).toBeLessThanOrEqual(box.d / 2 + 0.05);
      }
    }
  });
  it("every Lighting catalogue entry is a light, ceiling ones hang from the ceiling", () => {
    for (const c of CATALOGUE.filter((c) => c.category === "Lighting")) {
      expect(isLightItem(c), c.id).toBe(true);
      const b = fixtureBox(fx(c.id), c, 2.4);
      if (c.ceiling) expect(b.z0 + b.h + dropOf({}, c), c.id).toBeCloseTo(2.4, 5);
      else expect(b.z0, c.id).toBe(c.mount);
    }
    // Without a ceiling height the default stands in, and a drop can't push a fitting below the floor.
    expect(fixtureBox(fx("pendant"), byId("pendant")!).z0).toBeCloseTo(2.4 - 0.25 - 0.25, 5);
    expect(fixtureBox(fx("pendant", { drop: 9 }), byId("pendant")!, 2.4).z0).toBe(0);
  });
  it("lays downlights out on a grid at the pitch", () => {
    expect(gridPoints(2.4, 2.4, 1.2, 0)).toHaveLength(4);
    expect(gridPoints(0.5, 0.5, 1.2, 0)).toEqual([[0, 0, 0]]);
    const pts = gridPoints(3.6, 1.2, 1.2, 0);
    expect(pts).toHaveLength(3);
    pts.map((p) => p[0]).forEach((x, i) => expect(x).toBeCloseTo([-1.2, 0, 1.2][i], 9));
  });
  it("merges a pendant bar's three drops into one dimmed light at their centre, with a wider cone", () => {
    const floor = { id: "g", name: "G", level: 0, image: "", pxPerM: 100, origin: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, rooms: [], fixtures: [fx("pendant-multi", { id: "pm", dim: 50 })] } as unknown as Floor;
    const lights = floorLamps(floor, 2.4, 0, () => true);
    expect(lights).toHaveLength(1);
    expect(lights[0].candela).toBeCloseTo(candela(1200) * 0.5, 5);
    expect(lights[0].spot!.angle).toBeGreaterThan(LAMPS["pendant-multi"]!.spot!.angle);
    expect(lights[0].spot!.angle).toBeLessThan(Math.PI / 2);
    expect(lights[0].color).toBe(WARMTH_COLOR[2700]);
    expect(lights.map((l) => l.id)).toEqual(["g:pm:0"]);
    const bulbs = bulbsWorld(floor, floor.fixtures![0], byId("pendant-multi")!, 2.4, 0);
    expect(lights[0].pos[0]).toBeCloseTo((bulbs[0][0] + bulbs[1][0] + bulbs[2][0]) / 3, 9);
    expect(lights[0].pos[1]).toBeCloseTo(bulbs[0][1], 9);
  });
  it("clusters bulbs by distance", () => {
    expect(clusterBulbs([[0, 0, 0], [0.3, 0, 0], [0.6, 0, 0], [0.9, 0, 0]])).toEqual([[0, 1, 2, 3]]);
    expect(clusterBulbs([[0, 0, 0], [1.2, 0, 0], [0, 0, 1.2], [1.2, 0, 1.2]])).toEqual([[0], [1], [2], [3]]);
    expect(clusterBulbs([[0, 0, 0], [0.3, 0, 0], [0.6, 0, 0], [0.9, 0, 0], [1.2, 0, 0], [1.5, 0, 0], [1.8, 0, 0]])).toEqual([[0, 1, 2, 3], [4, 5, 6]]);
    expect(clusterBulbs([])).toEqual([]);
  });
  it("looks at the point on the lamp-height plane in the middle of the view", () => {
    // Straight down from 9 m: the point below, at FOCUS_Y.
    const down = focusPoint([3, 9, 4], [0, -1, 0]);
    expect(down[0]).toBe(3);
    expect(down[1]).toBeCloseTo(1.2, 9);
    expect(down[2]).toBe(4);
    // Looking down at 45 degrees from 5 m up: 3.8 m out.
    const f = focusPoint([0, 5, 0], [0, -Math.SQRT1_2, -Math.SQRT1_2]);
    expect(f[1]).toBeCloseTo(1.2, 9);
    expect(f[2]).toBeCloseTo(-3.8, 9);
    // Level or upward views: 10 m along.
    expect(focusPoint([0, 1, 0], [1, 0, 0])).toEqual([10, 1, 0]);
    const up = focusPoint([0, 0.5, 0], [0, 0.6, 0.8]);
    expect(up[1]).toBeCloseTo(6.5, 9);
    expect(up[2]).toBeCloseTo(8, 9);
    // Far above the plane, the focus is capped at 60 m out; close to it, at least 1 m.
    expect(focusPoint([0, 200, 0], [0, -1, 0])[1]).toBe(140);
    expect(focusPoint([0, 1.3, 0], [0, -1, 0])[1]).toBeCloseTo(0.3, 9);
  });
  it("sizes the pool to the house's bulbs, capped, whatever is switched on or shown", () => {
    const g = { id: "g", name: "G", level: 0, image: "", pxPerM: 100, origin: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, rooms: [], fixtures: [fx("pendant-multi", { id: "pm", on: false }), fx("table-lamp", { id: "t" })] } as unknown as Floor;
    const f1 = { ...g, id: "f1", level: 1, fixtures: [fx("downlight-grid", { id: "dg" }), fx("floor-lamp", { id: "fl" }), fx("sofa", { id: "s" })] } as unknown as Floor;
    const model = { floors: [g, f1], ceilingHeight: 2.4 };
    // The pendant bar (one light for its three drops) and 4 downlights are spots, the table and floor lamps points.
    expect(poolFor(model, POOL.high)).toEqual({ point: 2, spot: 5, casters: 4 });
    expect(poolFor(model, POOL.low)).toEqual({ point: 2, spot: 5, casters: 0 });
    // Over the cap: half each, then the rest to the kind that still wants it.
    expect(poolFor(model, { total: 4, casters: 1 })).toEqual({ point: 2, spot: 2, casters: 1 });
    expect(poolFor({ ...model, floors: [f1, f1, f1] }, { total: 8, casters: 0 })).toEqual({ point: 3, spot: 5, casters: 0 });
    expect(poolFor({ ...model, floors: [f1, f1, f1, f1] }, { total: 8, casters: 0 })).toEqual({ point: 4, spot: 4, casters: 0 });
    expect(poolFor({ ...model, floors: [f1, f1, f1, f1, f1] }, { total: 8, casters: 0 })).toEqual({ point: 4, spot: 4, casters: 0 });
    expect(poolFor({ floors: [], ceilingHeight: 2.4 }, POOL.high)).toEqual({ point: 0, spot: 0, casters: 0 });
    const prev = poolFor(model, POOL.high);
    expect(poolFor(model, POOL.high, prev)).toBe(prev);
    expect(poolFor({ ...model, floors: [g] }, POOL.high, prev)).not.toBe(prev);
  });
  it("gives every downlight of a grid its full lumens", () => {
    const floor = { id: "g", name: "G", level: 0, image: "", pxPerM: 100, origin: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, rooms: [], fixtures: [fx("downlight-grid", { id: "dg" })] } as unknown as Floor;
    const lights = floorLamps(floor, 2.4, 0, () => true);
    expect(lights).toHaveLength(4);
    lights.forEach((l) => expect(l.candela).toBeCloseTo(candela(450), 5));
  });
  it("warmth and dimmer fall back sensibly", () => {
    expect(warmthOf({})).toBe(2700);
    expect(warmthOf({ warmth: 4000 })).toBe(4000);
    expect(dimOf({})).toBe(1);
    expect(dimOf({ dim: 25 })).toBe(0.25);
    expect(dimOf({ dim: 0 })).toBe(0.01);
  });
  it("glows nothing when unlit, fully at night and visibly by day when lit", () => {
    expect(lampGlow(false, -10)).toBe(0);
    expect(lampGlow(true, -10)).toBe(1);
    expect(lampGlow(true, null)).toBeGreaterThanOrEqual(0.5);
    expect(lampGlow(true, 2)).toBeGreaterThan(lampGlow(true, 12));
  });
  it("converts lumens to candela", () => {
    expect(candela(4 * Math.PI)).toBeCloseTo(1);
    expect(candela(800)).toBeCloseTo(63.66, 1);
  });
});

describe("pickLights", () => {
  const at = (x: number, z: number, id: string) => ({ id, pos: [x, 1, z] as const });
  it("keeps everything under the cap, in order", () => {
    const ls = [at(5, 0, "a"), at(1, 0, "b")];
    expect(pickLights(ls, [0, 0, 0], 2).map((l) => l.id)).toEqual(["a", "b"]);
  });
  it("keeps the nearest to the eye", () => {
    const ls = [at(5, 0, "far"), at(1, 0, "near"), at(2, 2, "mid"), at(1, 0, "near2")];
    expect(pickLights(ls, [0, 0, 0], 2).map((l) => l.id)).toEqual(["near", "near2"]);
    expect(pickLights(ls, [0, 0, 0], 0)).toEqual([]);
  });
});

describe("litRooms", () => {
  const floor = {
    rooms: [
      { id: "a", name: "A", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] },
      { id: "b", name: "B", polygon: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] },
    ],
    fixtures: [fx("floor-lamp", { id: "l1", x: 50, y: 50 }), fx("table-lamp", { id: "l2", x: 150, y: 50, on: false }), fx("sofa-3", { id: "s", x: 150, y: 60 })],
  };
  it("names the rooms holding a lit light", () => {
    const lit = (f: Fixture) => fixtureLit(f, byId(f.type)!, "on", null);
    expect([...litRooms(floor, lit)]).toEqual(["a"]);
    expect(litRooms(floor, () => false).size).toBe(0);
  });
});

describe("bulbWorld and floorLamps", () => {
  // 100 px to the metre, plan origin at (100, 100) px placed at world (1, 2).
  const floor = { id: "g", level: 0, name: "Ground", rooms: [], origin: { x: 100, y: 100 }, offset: { x: 1, y: 2 }, pxPerM: 100 } as unknown as Floor;
  const desk = byId("desk-lamp")!;
  it("puts the bulb at the fixture's plan position and mount height, turned with it", () => {
    const f = fx("desk-lamp", { x: 200, y: 300 });
    const [x, y, z] = bulbWorld(floor, f, desk, 2.4, 3)!;
    const lz = desk.d / 2 - desk.d * 0.2;
    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(3 + 0.75 + desk.h - 0.11);
    expect(z).toBeCloseTo(4 + lz);
    // A quarter turn clockwise on the plan swings the head's front (+plan y) to -x.
    const [x2, , z2] = bulbWorld(floor, { ...f, rot: 90 }, desk, 2.4, 3)!;
    expect(x2).toBeCloseTo(2 - lz);
    expect(z2).toBeCloseTo(4);
  });
  it("lists the lit lamps only, with their candela and reach", () => {
    const f = { ...floor, fixtures: [fx("floor-lamp", { id: "a" }), fx("table-lamp", { id: "b", on: false }), fx("sofa-3", { id: "c" })] } as Floor;
    const lamps = floorLamps(f, 2.4, 0, (x, item) => fixtureLit(x, item, "on", null));
    expect(lamps.map((l) => l.id)).toEqual(["g:a:0"]);
    expect(lamps[0].candela).toBeCloseTo(candela(LAMPS["floor-lamp"]!.lumens));
    expect(lamps[0].reach).toBe(LAMPS["floor-lamp"]!.reach);
  });
});

describe("nightHour", () => {
  it("is after sunset, with the sun at the night altitude, in spring and winter", () => {
    for (const [m, d] of [[3, 21], [12, 21], [10, 27]]) {
      const doy = dayOfYear(YEAR, m, d);
      const h = nightHour(site, YEAR, doy);
      expect(h).toBeGreaterThan(sunTimes(site.latitude, site.longitude, YEAR, doy).sunset!);
      expect(solarPosition(site.latitude, site.longitude, YEAR, doy, h).altitude).toBeCloseTo(NIGHT_PRESET_ALTITUDE, 2);
    }
  });
  it("is late but before midnight at midsummer", () => {
    const h = nightHour(site, YEAR, dayOfYear(YEAR, 6, 21));
    expect(h).toBeGreaterThan(22);
    expect(h).toBeLessThanOrEqual(23.75);
  });
});

describe("coneGain", () => {
  it("is 1 with no cone or a full sphere, and grows as the cone narrows", () => {
    expect(coneGain()).toBe(1);
    expect(coneGain(Math.PI)).toBeCloseTo(1);
    expect(coneGain(Math.PI / 2)).toBeCloseTo(2);
    expect(coneGain((35 * Math.PI) / 180)).toBeGreaterThan(coneGain((75 * Math.PI) / 180));
  });
  it("keeps the flux: gain times the cone's solid angle is the whole sphere", () => {
    const a = (35 * Math.PI) / 180;
    expect(coneGain(a) * 2 * Math.PI * (1 - Math.cos(a))).toBeCloseTo(4 * Math.PI);
  });
});

describe("ceiling and wall lights", () => {
  it("are lights, with spots for downlights and bars", () => {
    for (const id of ["pendant", "pendant-multi", "flush-light", "downlight", "downlight-grid", "spot-bar", "wall-light", "outside-light", "strip-light"]) expect(isLightItem(byId(id)!), id).toBe(true);
    expect(LAMPS.downlight?.spot).toBeDefined();
    expect(LAMPS["spot-bar"]?.spot).toBeDefined();
  });
  it("go dark when any switch that controls them is off", () => {
    const item = byId("pendant")!;
    expect(fixtureLit(fx("pendant"), item, "on", null, [{}, { on: true }])).toBe(true);
    expect(fixtureLit(fx("pendant"), item, "on", null, [{}, { on: false }])).toBe(false);
    expect(fixtureLit(fx("pendant"), item, "on", null)).toBe(true);
  });
});

describe("assignSlots", () => {
  const lamp = (id: string, x: number, spot = false): LampLight => ({ id, pos: [x, 0, 0], color: "#fff", candela: 1, reach: 4, spot: spot ? { angle: 1, penumbra: 0.5 } : undefined });
  const sizes: PoolSizes = { point: 3, spot: 3, casters: 1 };
  const eye: [number, number, number] = [0, 0, 0];
  const ids = (s: Slots) => [...s.point, ...s.spot].filter((x): x is string => x !== null);

  it("returns the same reference for the same input", () => {
    const ls = [lamp("a", 1), lamp("b", 2, true)];
    const s = assignSlots(null, ls, eye, sizes);
    expect(assignSlots(s, ls, eye, sizes)).toBe(s);
  });
  it("leaves nulls when there are fewer lamps than slots", () => {
    const s = assignSlots(null, [lamp("a", 1)], eye, sizes);
    expect(s.point).toEqual(["a", null, null]);
    expect(s.spot).toEqual([null, null, null]);
  });
  it("evicts the farthest past the cap and leaves the others where they were", () => {
    const ls = [lamp("a", 1), lamp("b", 2), lamp("c", 3)];
    const s = assignSlots(null, ls, eye, sizes);
    const next = assignSlots(s, [...ls, lamp("near", 0.5)], eye, sizes);
    expect(next.point).toEqual(["a", "b", "near"]);
    expect(ids(next)).not.toContain("c");
  });
  it("moves a spot promoted to caster into the caster slots, leaving the rest", () => {
    const ls = [lamp("s1", 1, true), lamp("s2", 2, true), lamp("s3", 3, true)];
    const s = assignSlots(null, ls, eye, sizes);
    expect(s.spot).toEqual(["s1", "s2", "s3"]);
    const next = assignSlots(s, [...ls, lamp("s0", 0.1, true)], eye, sizes);
    expect(next.spot[0]).toBe("s0");
    expect(next.spot.slice(1).sort()).toEqual(["s1", "s2"]);
    expect(next.spot[1]).toBe("s2");
  });
  const big: PoolSizes = { point: 8, spot: 8, casters: 4 };
  it("re-packs when the sizes change", () => {
    const ls = [lamp("a", 1), lamp("b", 2)];
    const s = assignSlots(null, ls, eye, sizes);
    const bigger = assignSlots(s, ls, eye, big);
    expect(bigger.point).toHaveLength(big.point);
    expect(bigger.spot).toHaveLength(big.spot);
    expect(bigger.point.slice(0, 2)).toEqual(["a", "b"]);
  });
  it("never holds more ids than slots, or one twice", () => {
    const ls = Array.from({ length: 40 }, (_, i) => lamp("l" + i, i, i % 2 === 0));
    const s = assignSlots(null, ls, eye, big);
    expect(s.point.filter(Boolean).length).toBeLessThanOrEqual(big.point);
    expect(s.spot.filter(Boolean).length).toBeLessThanOrEqual(big.spot);
    expect(new Set(ids(s)).size).toBe(ids(s).length);
  });
});
