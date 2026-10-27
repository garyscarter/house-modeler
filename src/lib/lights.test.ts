import { describe, expect, it } from "vitest";
import { LAMPS, LIGHTS_AUTO_ALTITUDE, bulbWorld, candela, floorLamps, fixtureLit, isLightItem, lampGlow, lightsMaster, lightsOn, litRooms, pickLights } from "./lights";
import { byId } from "./catalogue";
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
    const box = { w: 0.4, d: 0.4, h: 1.6 };
    for (const [symbol, lamp] of Object.entries(LAMPS)) {
      const [x, y, z] = lamp!.bulb(box);
      expect(Math.abs(x), symbol).toBeLessThanOrEqual(box.w / 2);
      expect(y, symbol).toBeGreaterThan(0);
      expect(y, symbol).toBeLessThanOrEqual(box.h);
      expect(Math.abs(z), symbol).toBeLessThanOrEqual(box.d / 2 + 0.05);
    }
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
    expect(lamps.map((l) => l.id)).toEqual(["g:a"]);
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
