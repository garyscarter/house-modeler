import type { Fixture, Floor, LightWarmth } from "../types";
import { byId, pitchOf, type CatalogueItem, type Symbol } from "./catalogue";
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
 * every wall switch that controls it (`Fixture.controls` on a switch, see
 * lib/electrics.ts controllersOf) is on AND the master lets lights be on:
 * "auto" means from dusk in a sun study, "on" always, "off" never.
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

/** The light fitting each light symbol is: where its bulbs are in the fixture's own frame, how bright, and how it throws light. */
export interface LampDef {
  /** Light output in lumens of the whole fitting (an 800 lm bulb is a 60 W equivalent); split evenly over its bulbs. */
  lumens: number;
  /**
   * Bulb centres in the fixture's frame (x right, y up from the base, z towards the front), from its box w, d, h and,
   * for grids, the fixture's pitch. The 3D view places them with the fixture's position and rotation.
   */
  bulbs: (box: { w: number; d: number; h: number }, pitch: number) => [number, number, number][];
  /** How far the light reaches (metres); beyond it the light is cut off. */
  reach: number;
  /**
   * Throws light downwards in a cone (a spot light aimed at the floor) rather than all round: half-angle in radians
   * and penumbra 0-1. Ceiling fittings use this so their light stays on their own storey.
   */
  spot?: { angle: number; penumbra: number };
  /** Fixed light colour (lit mirrors); absent means the fixture's warmth decides. */
  color?: string;
}

const COOL_WHITE = "#eef3ff";
const one = (p: [number, number, number]): [number, number, number][] => [p];
const DEG = Math.PI / 180;

/** Downlight centres over a w × d area at `pitch` spacing, centred, at least one each way, in the fixture's frame at height y. */
export function gridPoints(w: number, d: number, pitch: number, y: number): [number, number, number][] {
  const cols = Math.max(1, Math.round(w / pitch));
  const rows = Math.max(1, Math.round(d / pitch));
  const out: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([((c + 0.5) / cols - 0.5) * w, y, ((r + 0.5) / rows - 0.5) * d]);
  return out;
}

/** Light fittings by catalogue symbol. Every symbol here is a light; any other fixture is not. */
export const LAMPS: Partial<Record<Symbol, LampDef>> = {
  // Lamps: a point of light inside the shade.
  // Shade bottom to top is the last 0.33 m of a floor lamp; the bulb sits in the lower half of the shade.
  "floor-lamp": { lumens: 800, reach: 6, bulbs: ({ h }) => one([0, h - 0.2, 0]) },
  // Table lamps: the shade is min(0.28, 0.45 h) tall at the top of the lamp (see three/Fixtures.tsx).
  "table-lamp": { lumens: 470, reach: 4.5, bulbs: ({ h }) => one([0, h - Math.min(0.28, h * 0.45) / 2, 0]) },
  // The head looks down from near the front; the bulb is just under it.
  "desk-lamp": { lumens: 400, reach: 3, spot: { angle: 50 * DEG, penumbra: 0.5 }, bulbs: ({ d, h }) => one([0, h - 0.11, d / 2 - d * 0.2]) },
  // Edge-lit mirror: a soft cool glow from the whole face.
  "mirror-lit": { lumens: 600, reach: 3, color: COOL_WHITE, bulbs: ({ d, h }) => one([0, h / 2, d / 2 + 0.05]) },
  // Ceiling fittings: cones aimed at the floor, wide for shaded pendants and diffusers, tight for spots.
  pendant: { lumens: 800, reach: 6, spot: { angle: 75 * DEG, penumbra: 0.6 }, bulbs: ({ h }) => one([0, h * 0.4, 0]) },
  "pendant-multi": { lumens: 1200, reach: 4, spot: { angle: 60 * DEG, penumbra: 0.6 }, bulbs: ({ w, h }) => [-w / 3, 0, w / 3].map((x) => [x, h * 0.4, 0] as [number, number, number]) },
  "flush-light": { lumens: 1200, reach: 6, spot: { angle: 80 * DEG, penumbra: 0.7 }, bulbs: ({ h }) => one([0, h * 0.5, 0]) },
  downlight: { lumens: 450, reach: 4, spot: { angle: 35 * DEG, penumbra: 0.5 }, bulbs: () => one([0, 0, 0]) },
  "downlight-grid": { lumens: 450, reach: 4, spot: { angle: 35 * DEG, penumbra: 0.5 }, bulbs: ({ w, d }, pitch) => gridPoints(w, d, pitch, 0) },
  "spot-bar": { lumens: 1050, reach: 4.5, spot: { angle: 30 * DEG, penumbra: 0.4 }, bulbs: ({ w }) => [-w / 3, 0, w / 3].map((x) => [x, 0.04, 0] as [number, number, number]) },
  // Wall fittings: an up-and-down washer on the wall, and a strip under a wall unit lighting the worktop.
  "wall-light": { lumens: 500, reach: 3.5, bulbs: ({ d, h }) => one([0, h / 2, d / 2]) },
  "strip-light": { lumens: 400, reach: 2, spot: { angle: 70 * DEG, penumbra: 0.8 }, bulbs: ({ w }) => gridPoints(w, 0, 0.3, 0) },
};

/** Colour temperatures offered, and the light colour of each (sRGB, roughly a blackbody at that temperature). */
export const WARMTHS: LightWarmth[] = [2700, 3000, 4000];
export const WARMTH_LABEL: Record<LightWarmth, string> = { 2700: "Warm (2700K)", 3000: "Soft (3000K)", 4000: "Cool (4000K)" };
export const WARMTH_COLOR: Record<LightWarmth, string> = { 2700: "#ffd9a8", 3000: "#ffe3c0", 4000: "#f6f2e6" };
export const DEFAULT_WARMTH: LightWarmth = 2700;
export const warmthOf = (fx: Pick<Fixture, "warmth">): LightWarmth => (fx.warmth && WARMTHS.includes(fx.warmth) ? fx.warmth : DEFAULT_WARMTH);
/** Dimmer setting as a 0-1 factor (absent = full). */
export const dimOf = (fx: Pick<Fixture, "dim">): number => (fx.dim !== undefined && Number.isFinite(fx.dim) ? Math.min(1, Math.max(0.01, fx.dim / 100)) : 1);
/** The colour a fixture's light is: the fitting's fixed colour, else its warmth. */
export const lightColor = (fx: Pick<Fixture, "warmth">, lamp: Pick<LampDef, "color">): string => lamp.color ?? WARMTH_COLOR[warmthOf(fx)];
/** Grids: the downlight spacing to use for a fixture. */
export const lampPitch = (fx: Pick<Fixture, "pitch">, item: Pick<CatalogueItem, "pitch">): number => pitchOf(fx, item);

export const isLightItem = (item: Pick<CatalogueItem, "symbol">): boolean => item.symbol in LAMPS;
export const lampOf = (item: Pick<CatalogueItem, "symbol">): LampDef | undefined => LAMPS[item.symbol];

/** The fixture's own switch (absent = on). */
export const switchedOn = (fx: Pick<Fixture, "on">): boolean => fx.on !== false;

/**
 * A light fixture that is lit now: its own switch on, every switch that controls it on (`controllers`, from
 * lib/electrics.ts controllersOf; none = no wall switch) and the master allowing it. False for anything that is not a light.
 */
export function fixtureLit(
  fx: Pick<Fixture, "on">,
  item: Pick<CatalogueItem, "symbol">,
  master: LightsMaster,
  altitude: number | null,
  controllers: readonly Pick<Fixture, "on">[] = [],
): boolean {
  return isLightItem(item) && switchedOn(fx) && controllers.every(switchedOn) && lightsOn(master, altitude);
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

/** Spot lights that cast shadows per rendering quality (the nearest ones): the rest light through walls. */
export const SHADOW_CAP: Record<"high" | "balanced" | "low", number> = { high: 4, balanced: 0, low: 0 };

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

/** A lit light's bulb in the scene: world position (x, y up, z = plan y), colour, candela, reach and, for cones, where it aims. */
export interface LampLight {
  /** Floor, fixture id and bulb index, unique across the house. */
  id: string;
  pos: [number, number, number];
  color: string;
  candela: number;
  reach: number;
  /** Aimed down at the floor as a cone (a spot light), with its half-angle and penumbra; absent = all round. */
  spot?: { angle: number; penumbra: number };
}

/**
 * The bulbs of a light fixture in world space: LAMPS[symbol].bulbs in the fixture's frame, turned by its rotation
 * (plan degrees clockwise, the 3D view's yaw of -rot about +y) and moved to its plan position and height, on a
 * storey whose base is at `baseY`. Empty for anything that is not a light.
 */
export function bulbsWorld(floor: Floor, fx: Fixture, item: CatalogueItem, ceiling: number, baseY: number): [number, number, number][] {
  const lamp = lampOf(item);
  if (!lamp) return [];
  const b = fixtureBox(fx, item, ceiling);
  const t = (-fx.rot * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const p = toWorld(floor, { x: fx.x, y: fx.y });
  return lamp.bulbs(b, lampPitch(fx, item)).map(([lx, ly, lz]) => [p.x + lx * c + lz * s, baseY + b.z0 + ly, p.y - lx * s + lz * c]);
}

/** The first bulb of a light fixture in world space (see bulbsWorld), or null for anything that is not a light. */
export function bulbWorld(floor: Floor, fx: Fixture, item: CatalogueItem, ceiling: number, baseY: number): [number, number, number] | null {
  return bulbsWorld(floor, fx, item, ceiling, baseY)[0] ?? null;
}

/** Every lit light on a floor as scene lights, one per bulb, dimmed by the fixture's dimmer (`lit` says which fixtures are lit, see fixtureLit). */
export function floorLamps(floor: Floor, ceiling: number, baseY: number, lit: (fx: Fixture, item: CatalogueItem) => boolean): LampLight[] {
  const out: LampLight[] = [];
  for (const fx of floor.fixtures ?? []) {
    const item = byId(fx.type);
    const lamp = item && lampOf(item);
    if (!item || !lamp || !lit(fx, item)) continue;
    const bulbs = bulbsWorld(floor, fx, item, ceiling, baseY);
    const cd = (candela(lamp.lumens) * dimOf(fx)) / Math.max(1, bulbs.length);
    const color = lightColor(fx, lamp);
    bulbs.forEach((pos, i) => out.push({ id: `${floor.id}:${fx.id}:${i}`, pos, color, candela: cd, reach: lamp.reach, spot: lamp.spot }));
  }
  return out;
}
