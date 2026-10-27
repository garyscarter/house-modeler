import type { Fixture, Floor, LightWarmth } from "../types";
import { gridOf, type CatalogueItem, type Symbol } from "./catalogue";
import { pointInPolygon } from "./geometry";
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
  /**
   * A spot light aiming straight down (downlights, spot bars, strips) instead of a point light: the cone's
   * half-angle in radians and its soft edge, 0 to 1 (three.js SpotLight angle and penumbra).
   */
  spot?: { angle: number; penumbra: number };
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
  // Ceiling and wall lights (category Lighting). Lumens are per bulb: a grid, cluster or bar has several (lampBulbs).
  pendant: { lumens: 800, color: WARM, reach: 6, bulb: ({ h }) => [0, h * 0.4, 0] },
  "pendant-multi": { lumens: 400, color: WARM, reach: 4.5, bulb: ({ h }) => [0, h * 0.4, 0] },
  "ceiling-flush": { lumens: 1500, color: WARM, reach: 6, bulb: ({ h }) => [0, h * 0.5, 0] },
  downlight: { lumens: 500, color: WARM, reach: 4.5, bulb: ({ h }) => [0, h * 0.5, 0], spot: { angle: 0.55, penumbra: 0.5 } },
  "downlight-grid": { lumens: 500, color: WARM, reach: 4.5, bulb: ({ h }) => [0, h * 0.5, 0], spot: { angle: 0.55, penumbra: 0.5 } },
  "spot-bar": { lumens: 350, color: WARM, reach: 4, bulb: ({ h }) => [0, h * 0.3, 0], spot: { angle: 0.35, penumbra: 0.4 } },
  "wall-light": { lumens: 600, color: WARM, reach: 4.5, bulb: ({ d, h }) => [0, h * 0.5, d * 0.1] },
  "strip-light": { lumens: 300, color: WARM, reach: 2, bulb: ({ d, h }) => [0, h * 0.5, d * 0.1], spot: { angle: 1.1, penumbra: 0.8 } },
};

/** Light colour per colour temperature (Fixture.warmth). */
export const WARMTH_COLOR: Record<LightWarmth, string> = { 2700: WARM, 3000: "#ffe6c8", 4000: "#f2f4ff" };
export const WARMTHS: LightWarmth[] = [2700, 3000, 4000];
export const WARMTH_LABEL: Record<LightWarmth, string> = { 2700: "Warm (2700 K)", 3000: "Soft (3000 K)", 4000: "Cool (4000 K)" };

/**
 * Every bulb of a light in its own frame (as LampDef.bulb): one for most, one per grid point of a downlight grid
 * (cols along x, rows along z, centred), three across a pendant cluster and a spot bar. Empty for non-lights.
 * The 3D view turns each into a point or spot light, all switched together.
 */
export function lampBulbs(fx: Pick<Fixture, "cols" | "rows" | "pitch">, item: Pick<CatalogueItem, "symbol" | "grid">, box: { w: number; d: number; h: number }): [number, number, number][] {
  const lamp = LAMPS[item.symbol];
  if (!lamp) return [];
  const [, y, z] = lamp.bulb(box);
  const g = gridOf(fx, item);
  if (g) {
    const out: [number, number, number][] = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) out.push([(c - (g.cols - 1) / 2) * g.pitch, y, (r - (g.rows - 1) / 2) * g.pitch]);
    return out;
  }
  if (item.symbol === "pendant-multi") return [-box.w / 3, 0, box.w / 3].map((x) => [x, y, z]);
  if (item.symbol === "spot-bar") return [-box.w * 0.35, 0, box.w * 0.35].map((x) => [x, y, z]);
  return [lamp.bulb(box)];
}

/** A light's output per bulb: its lumens scaled by the dimmer (Fixture.dim, percent, absent = 100) and its colour (Fixture.warmth). */
export function lampOutput(fx: Pick<Fixture, "dim" | "warmth">, item: Pick<CatalogueItem, "symbol">): { lumens: number; color: string } | undefined {
  const lamp = LAMPS[item.symbol];
  if (!lamp) return undefined;
  const dim = fx.dim !== undefined && Number.isFinite(fx.dim) ? Math.max(1, Math.min(100, fx.dim)) : 100;
  return { lumens: (lamp.lumens * dim) / 100, color: fx.warmth ? WARMTH_COLOR[fx.warmth] ?? lamp.color : lamp.color };
}

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
