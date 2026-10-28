import type { HouseModel } from "../types";
import { houseHeight } from "./viewFraming";
import { floorDisplayName } from "./studio";

/**
 * The 3D view's section cut: a horizontal plane at `height` metres above the
 * ground floor (world y = height) that hides everything above it, so the
 * owner can look down into a floor like a doll's house.
 */

/** Cut height above a floor that shows it as a plan does: walls, doors and windows cut through, furniture whole. */
export const FLOOR_CUT = 1.2;
/** How far below a floor's ceiling its "below the ceiling" stop sits. */
export const CEILING_GAP = 0.1;
/** Headroom above the ridge at the top of the range, so the top of the slider is clearly "nothing cut". */
export const TOP_MARGIN = 0.3;
/** The lowest cut sits this far above the lowest floor, so there is always some wall to see. */
export const BOTTOM_MARGIN = 0.3;
/** The slider snaps to a stop within this distance, metres. */
export const SNAP = 0.12;

const DEFAULT_CEILING = 2.4;
const DEFAULT_SLAB = 0.25;

export interface SectionRange {
  min: number;
  max: number;
}

export interface SectionStop {
  id: string;
  /** Short name for a tick or chip: the floor's name, plus "ceiling" for the higher stop. */
  label: string;
  height: number;
  level: number;
  kind: "floor" | "ceiling";
}

const storeyOf = (model: HouseModel) => {
  const ceiling = Number.isFinite(model.ceilingHeight) && model.ceilingHeight > 0 ? model.ceilingHeight : DEFAULT_CEILING;
  const slab = Number.isFinite(model.slabThickness) && model.slabThickness >= 0 ? model.slabThickness : DEFAULT_SLAB;
  return { ceiling, slab, storey: ceiling + slab };
};

/** Heights the cut can take: from just above the lowest floor to just over the ridge (or the top floor's walls). */
export function sectionRange(model: HouseModel): SectionRange {
  const { storey } = storeyOf(model);
  const levels = model.floors.map((f) => f.level);
  const lowest = levels.length ? Math.min(...levels) : 0;
  const min = lowest * storey + BOTTOM_MARGIN;
  const top = Math.max(houseHeight(model), (levels.length ? Math.max(...levels) + 1 : 1) * storey);
  return { min, max: Math.max(min + 0.5, top + TOP_MARGIN) };
}

/** Two stops per floor, lowest first: a plan-height cut just above the floor, and one just below its ceiling. */
export function sectionStops(model: HouseModel): SectionStop[] {
  const { ceiling, storey } = storeyOf(model);
  const floors = [...model.floors].sort((a, b) => a.level - b.level);
  const out: SectionStop[] = [];
  for (const f of floors) {
    const base = f.level * storey;
    const name = floorDisplayName(f.name);
    out.push({ id: `${f.id}:floor`, label: name, height: round(base + FLOOR_CUT), level: f.level, kind: "floor" });
    out.push({ id: `${f.id}:ceiling`, label: `${name}, below ceiling`, height: round(base + ceiling - CEILING_GAP), level: f.level, kind: "ceiling" });
  }
  return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function clampSection(h: number, range: SectionRange): number {
  if (!Number.isFinite(h)) return range.max;
  return Math.min(range.max, Math.max(range.min, h));
}

/** Clamp, then pull onto a stop within `snap` metres (the slider's detent). */
export function snapSection(h: number, stops: SectionStop[], range: SectionRange, snap = SNAP): number {
  const c = clampSection(h, range);
  const near = nearestStop(c, stops);
  return near && Math.abs(near.height - c) <= snap ? clampSection(near.height, range) : c;
}

export function nearestStop(h: number, stops: SectionStop[]): SectionStop | undefined {
  let best: SectionStop | undefined;
  for (const s of stops) if (!best || Math.abs(s.height - h) < Math.abs(best.height - h)) best = s;
  return best;
}

/** Where the cut starts when it is switched on: plan height on the top floor, which takes the roof and nothing else useful away. */
export function defaultSection(model: HouseModel): number {
  const floorStops = sectionStops(model).filter((s) => s.kind === "floor");
  const range = sectionRange(model);
  return clampSection(floorStops.length ? floorStops[floorStops.length - 1].height : range.max, range);
}

/** A short reading of a cut height: "1.20 m · Ground floor" when on a stop, else the floor it passes through. */
export function describeSection(h: number, model: HouseModel): string {
  const stops = sectionStops(model);
  const on = stops.find((s) => Math.abs(s.height - h) < 0.005);
  const m = `${h.toFixed(2)} m`;
  if (on) return `${m} · ${on.label}`;
  const { storey } = storeyOf(model);
  const level = Math.floor(h / storey);
  const floor = model.floors.find((f) => f.level === level);
  return floor ? `${m} · ${floorDisplayName(floor.name)}` : m;
}
