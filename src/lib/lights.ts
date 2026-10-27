import type { Fixture, Floor } from "../types";
import { byId, type CatalogueItem, type Symbol } from "./catalogue";
import { pointInPolygon, toWorld } from "./geometry";
import { fixtureBox } from "./planMath";
import { lightGlow } from "./dusk";

/**
 * Interior lighting: which fixtures are lights, whether they are lit, where
 * their bulbs are and how bright. Pure; the 3D view (three/Fixtures.tsx)
 * turns the results into point lights and glowing shades, the sun panel
 * (components/SunControls.tsx) owns the master switch.
 *
 * A light is lit when its own switch is on (`Fixture.on`, absent = on) AND
 * the master lets lights be on: "auto" means from dusk in a sun study,
 * "on" always, "off" never.
 */

export type LightsMaster = "auto" | "on" | "off";
export const LIGHTS_MASTERS: LightsMaster[] = ["auto", "on", "off"];
export const LIGHTS_MASTER_LABEL: Record<LightsMaster, string> = { auto: "Auto", on: "On", off: "Off" };
export const LIGHTS_MASTER_TITLE: Record<LightsMaster, string> = {
  auto: "Lights come on at dusk in the sun study",
  on: "Every switched-on light is lit, whatever the time",
  off: "No lights",
};
export const isLightsMaster = (v: unknown): v is LightsMaster => typeof v === "string" && (LIGHTS_MASTERS as string[]).includes(v);
/** The master from the sun state; older saves have none and read as auto. */
export const lightsMaster = (sun: { lights?: LightsMaster }): LightsMaster => sun.lights ?? "auto";

/** In Auto, lights come on once the sun has dropped to this altitude (degrees): the dusk preset's altitude, with a little margin. */
export const LIGHTS_AUTO_ALTITUDE = 3;

/** Whether the master lets lights be lit now. `altitude` null = the sun study is off (daytime). */
export function lightsOn(master: LightsMaster, altitude: number | null): boolean {
  if (master === "on") return true;
  if (master === "off") return false;
  return altitude !== null && altitude <= LIGHTS_AUTO_ALTITUDE;
}

/** The light fitting each light symbol is: a bulb position in the fixture's own frame and a brightness. */
export interface LampDef {
  /** Light output in lumens (an 800 lm bulb is a 60 W equivalent). */
  lumens: number;
  /** Light colour: a warm white for lamps. */
  color: string;
  /**
   * Bulb centre in the fixture's frame (x right, y up from the base, z towards the front), from its box w, d, h.
   * The 3D view places it with the fixture's position and rotation.
   */
  bulb: (box: { w: number; d: number; h: number }) => [number, number, number];
  /** How far the light reaches (metres); beyond it the point light is cut off. */
  reach: number;
}

const WARM = "#ffd9a8";
const COOL_WHITE = "#eef3ff";

/** Light fittings by catalogue symbol. Every symbol here is a light; any other fixture is not. */
export const LAMPS: Partial<Record<Symbol, LampDef>> = {
  // Shade bottom to top is the last 0.33 m of a floor lamp; the bulb sits in the lower half of the shade.
  "floor-lamp": { lumens: 800, color: WARM, reach: 6, bulb: ({ h }) => [0, h - 0.2, 0] },
  // Table lamps: the shade is min(0.28, 0.45 h) tall at the top of the lamp (see three/Fixtures.tsx).
  "table-lamp": { lumens: 470, color: WARM, reach: 4.5, bulb: ({ h }) => [0, h - Math.min(0.28, h * 0.45) / 2, 0] },
  // The head looks down from near the front; the bulb is just under it.
  "desk-lamp": { lumens: 400, color: WARM, reach: 3, bulb: ({ d, h }) => [0, h - 0.11, d / 2 - d * 0.2] },
  // Edge-lit mirror: a soft cool glow from the whole face.
  "mirror-lit": { lumens: 600, color: COOL_WHITE, reach: 3, bulb: ({ d, h }) => [0, h / 2, d / 2 + 0.05] },
};

export const isLightItem = (item: Pick<CatalogueItem, "symbol">): boolean => item.symbol in LAMPS;
export const lampOf = (item: Pick<CatalogueItem, "symbol">): LampDef | undefined => LAMPS[item.symbol];

/** The fixture's own switch (absent = on). */
export const switchedOn = (fx: Pick<Fixture, "on">): boolean => fx.on !== false;

/** A light fixture that is lit now: its own switch on and the master allowing it. False for anything that is not a light. */
export function fixtureLit(fx: Pick<Fixture, "on">, item: Pick<CatalogueItem, "symbol">, master: LightsMaster, altitude: number | null): boolean {
  return isLightItem(item) && switchedOn(fx) && lightsOn(master, altitude);
}

/** Glow of a lit lamp's shade in daylight: lit lamps always read as lit, even with the sun up. */
const LIT_DAY_GLOW = 0.5;

/**
 * Emissive strength of a lamp's bulb and shade, 0 to 1: nothing when unlit, and when lit the garden lights' glow
 * curve (full from the horizon down), never below LIT_DAY_GLOW so a forced-on lamp shows by day.
 */
export function lampGlow(lit: boolean, altitude: number | null): number {
  return lit ? Math.max(LIT_DAY_GLOW, lightGlow(altitude)) : 0;
}

/** Point light intensity in candela for a bulb's lumens (an even sphere of light: lm / 4π). */
export const candela = (lumens: number): number => lumens / (4 * Math.PI);

/** Real point lights per rendering quality; the rest of the lit lamps only glow. */
export const LIGHT_CAP: Record<"high" | "balanced" | "low", number> = { high: 16, balanced: 12, low: 8 };

/** The `cap` lights nearest to `eye` (world metres), nearest first. Ties keep input order. */
export function pickLights<T extends { pos: readonly [number, number, number] }>(lights: T[], eye: readonly [number, number, number], cap: number): T[] {
  if (lights.length <= cap) return lights.slice();
  const d2 = (l: T) => (l.pos[0] - eye[0]) ** 2 + (l.pos[1] - eye[1]) ** 2 + (l.pos[2] - eye[2]) ** 2;
  return lights
    .map((l, i) => ({ l, i, d: d2(l) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, Math.max(0, cap))
    .map((x) => x.l);
}

/** Ids of the floor's rooms with a lit light in them (by the fixture's centre), so their windows glow at night. */
export function litRooms(floor: Pick<Floor, "rooms" | "fixtures">, lit: (fx: Fixture) => boolean): Set<string> {
  const out = new Set<string>();
  for (const fx of floor.fixtures ?? []) {
    if (!lit(fx)) continue;
    const room = floor.rooms.find((r) => !out.has(r.id) && pointInPolygon({ x: fx.x, y: fx.y }, r.polygon));
    if (room) out.add(room.id);
  }
  return out;
}

/** A lit lamp's bulb as a point light: world position (x, y up, z = plan y), colour, candela and reach. */
export interface LampLight {
  /** Floor and fixture id, unique across the house. */
  id: string;
  pos: [number, number, number];
  color: string;
  candela: number;
  reach: number;
}

/**
 * The bulb of a light fixture in world space: LAMPS[symbol].bulb in the fixture's frame, turned by its rotation
 * (plan degrees clockwise, the 3D view's yaw of -rot about +y) and moved to its plan position and mount height,
 * on a storey whose base is at `baseY`.
 */
export function bulbWorld(floor: Floor, fx: Fixture, item: CatalogueItem, ceiling: number, baseY: number): [number, number, number] | null {
  const lamp = lampOf(item);
  if (!lamp) return null;
  const b = fixtureBox(fx, item, ceiling);
  const [lx, ly, lz] = lamp.bulb(b);
  const t = (-fx.rot * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const p = toWorld(floor, { x: fx.x, y: fx.y });
  return [p.x + lx * c + lz * s, baseY + b.z0 + ly, p.y - lx * s + lz * c];
}

/** Every lit lamp on a floor as a point light (`lit` says which fixtures are lit, see fixtureLit). */
export function floorLamps(floor: Floor, ceiling: number, baseY: number, lit: (fx: Fixture, item: CatalogueItem) => boolean): LampLight[] {
  const out: LampLight[] = [];
  for (const fx of floor.fixtures ?? []) {
    const item = byId(fx.type);
    const lamp = item && lampOf(item);
    if (!item || !lamp || !lit(fx, item)) continue;
    const pos = bulbWorld(floor, fx, item, ceiling, baseY);
    if (pos) out.push({ id: `${floor.id}:${fx.id}`, pos, color: lamp.color, candela: candela(lamp.lumens), reach: lamp.reach });
  }
  return out;
}
