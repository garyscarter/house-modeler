import {
  DOOR_STYLE_LABEL,
  FLOOR_FINISH_LABEL,
  GARAGE_STYLE_LABEL,
  GLAZING_LABEL,
  SIDELIGHT_LABEL,
  WALL_COVERING_LABEL,
  WALL_FINISH_LABEL,
  type Floor,
  type HouseModel,
  type Opening,
  type OpeningStyle,
  type Room,
  type Site,
} from "../types";
import { findRoom } from "./roomLinks";
import { areaM2, axisRect, formatArea } from "./planMath";
import { bbox } from "./geometry";
import { isUnheated } from "./report";
import { swatchName } from "./paintPalette";
import { exteriorOf } from "./roof";
import { floorDisplayName } from "./studio";
import { coverLayout, upperCovering } from "./wallCovering";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const colourName = (hex: string) => swatchName(hex) ?? hex;
const dirWord = (d: string) => d[0].toUpperCase() + d.slice(1);

export interface Stat {
  /** The number, set in mono. */
  value: string;
  /** What it counts, set muted under it. */
  label: string;
}

/** The floor at a glance: "76.0 m²", "7 rooms", "19 openings". Empty when there are no rooms. */
export function buildStats(floor: Floor): Stat[] {
  if (!floor.rooms.length) return [];
  const area = floor.rooms.reduce((s, r) => s + areaM2(r.polygon, floor.pxPerM), 0);
  const stats: Stat[] = [
    { value: area.toFixed(1), label: "m²" },
    { value: String(floor.rooms.length), label: floor.rooms.length === 1 ? "room" : "rooms" },
  ];
  const n = floor.openings.length;
  if (n) stats.push({ value: String(n), label: n === 1 ? "opening" : "openings" });
  return stats;
}

/** Edge keys of a room's wallFinishes that still name an edge. */
const featureKeys = (room: Room) =>
  Object.entries(room.wallFinishes ?? {})
    .filter(([k, v]) => Number(k) < room.polygon.length && v && Object.keys(v).length > 0)
    .map(([k]) => Number(k));

/** "Floors: Oak boards ×3, Ceramic tiles ×2, Plain colour ×2 · 2 feature walls" */
export function decorateSummary(floor: Floor): string {
  if (!floor.rooms.length) return "No rooms yet";
  const counts = new Map<string, number>();
  for (const r of floor.rooms) {
    const label = FLOOR_FINISH_LABEL[r.floorFinish ?? "plain"];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, 3).map(([l, n]) => `${l} ×${n}`);
  const parts = [`Floors: ${shown.join(", ")}${sorted.length > 3 ? " …" : ""}`];
  const feature = floor.rooms.reduce((s, r) => s + featureKeys(r).length, 0);
  if (feature) parts.push(plural(feature, "feature wall", "feature walls"));
  return parts.join(" · ");
}

/** "14 pieces on this floor · 1 overlap" */
export function furnishSummary(floor: Floor, clashes: number): string {
  const n = (floor.fixtures ?? []).length;
  if (!n) return "No furniture yet";
  const parts = [`${plural(n, "piece", "pieces")} on this floor`];
  if (clashes > 0) parts.push(plural(clashes, "overlap", "overlaps"));
  return parts.join(" · ");
}

/** "4.20 × 3.60 m · 15.1 m² · 163 ft²", plus "· printed 4.2 × 3.6" when the plan prints sizes. */
export function shapeSummary(room: Room, ppm: number): string {
  const r = axisRect(room.polygon, 0.5);
  const b = bbox(room.polygon);
  const w = (r ? r.x1 - r.x0 : b.w) / ppm;
  const d = (r ? r.y1 - r.y0 : b.h) / ppm;
  const base = `${w.toFixed(2)} × ${d.toFixed(2)} m · ${formatArea(areaM2(room.polygon, ppm))}`;
  return room.dims ? `${base} · printed ${room.dims.w} × ${room.dims.h}` : base;
}

/** "Heated · 2 photos · has notes" */
export function detailsSummary(room: Room, photoCount: number): string {
  const parts = [isUnheated(room) ? "Not heated" : "Heated"];
  if (photoCount > 0) parts.push(plural(photoCount, "photo", "photos"));
  if (room.notes?.trim()) parts.push("has notes");
  return parts.join(" · ");
}

/** "into 2 rooms" */
export const knockSummary = (n: number) => `into ${plural(n, "room", "rooms")}`;

/** "Same as Kitchen · " when a style is linked and the room list is known. */
function linkPrefix(id: string | undefined, floors?: Floor[]): string {
  const src = id && floors ? findRoom(floors, id) : undefined;
  return src ? `Same as ${src.room.name} · ` : "";
}

/** "Herringbone wood or LVT · 45° · #c8a97e" */
export function floorSummary(room: Room, floors?: Floor[]): string {
  const parts: string[] = [FLOOR_FINISH_LABEL[room.floorFinish ?? "plain"]];
  if (room.floorAngle) parts.push(`${Math.round(room.floorAngle)}°`);
  if (room.color) parts.push(room.color);
  return linkPrefix(room.floorFrom, floors) + parts.join(" · ");
}

/** "Paint · Warm white · skirting white" */
export function wallsSummary(room: Room, floors?: Floor[]): string {
  const parts: string[] = [WALL_COVERING_LABEL[room.wallCovering ?? "paint"]];
  const above = room.upperCovering && upperCovering(room) !== "paint" && coverLayout(room.wallCovering ?? "paint")?.paintAbove;
  if (above) parts.push(`${WALL_COVERING_LABEL[room.upperCovering!].toLowerCase()} above`);
  if (room.wallPaint) parts.push(colourName(room.wallPaint));
  parts.push(`skirting ${room.skirtingColor ? colourName(room.skirtingColor) : "white"}`);
  return linkPrefix(room.wallsFrom, floors) + parts.join(" · ");
}

/** "4 walls, 1 feature" */
export function eachWallSummary(room: Room): string {
  const n = room.polygon.length;
  const k = featureKeys(room).length;
  const walls = plural(n, "wall", "walls");
  return k ? `${walls}, ${plural(k, "feature", "features")}` : walls;
}

/** "House default" or the finish's name. */
export const outsideSummary = (room: Room) => (room.exteriorFinish ? WALL_FINISH_LABEL[room.exteriorFinish] : "House default");

const styleLabel = (s: OpeningStyle): string => (s in DOOR_STYLE_LABEL ? DOOR_STYLE_LABEL[s as keyof typeof DOOR_STYLE_LABEL] : GARAGE_STYLE_LABEL[s as keyof typeof GARAGE_STYLE_LABEL]);

/** "#ffffff · Fully glazed · frame #333333", or "Standard look" when nothing is set. */
export function openingLookSummary(o: Opening): string {
  const parts: string[] = [];
  if (o.color) parts.push(colourName(o.color));
  if (o.style) parts.push(styleLabel(o.style));
  if (o.glazing) parts.push(GLAZING_LABEL[o.glazing]);
  if (o.kind === "front" && o.sidelight) parts.push(SIDELIGHT_LABEL[o.sidelight].toLowerCase());
  if (o.frameColor) parts.push(`frame ${colourName(o.frameColor)}`);
  return parts.length ? parts.join(" · ") : "Standard look";
}

/** "Ground floor · scale set" */
export const floorSettingsSummary = (floor: Floor) => `${floorDisplayName(floor.name)} · scale set`;

/** "Up · 2.6 × 0.9 m" or "None" */
export function stairsSummary(floor: Floor): string {
  if (!floor.stairs) return "None";
  return `${dirWord(floor.stairsDir ?? "up")} · ${(floor.stairsLen ?? 2.6).toFixed(1)} × ${(floor.stairsWidth ?? 0.9).toFixed(1)} m`;
}

/** "No plot yet" or "Front faces 172°" */
export function siteSummary(site: Site | undefined): string {
  if (!site) return "No plot yet";
  return `Front faces ${Math.round(site.frontBearing)}°`;
}

/** "Gable roof · Smooth render" */
export function exteriorSummary(model: HouseModel): string {
  const ext = exteriorOf(model);
  const roof = ext.showRoof ? `${ext.roofStyle === "hip" ? "Hip" : "Gable"} roof` : "No roof";
  return `${roof} · ${WALL_FINISH_LABEL[ext.wallFinish ?? "render"]}`;
}

/**
 * The chip under the printed-size fields when the traced size is more than 5% out:
 * a short line ("10% narrower than printed") and the full sentence for its tooltip.
 * Null when the sizes agree.
 */
export function printedChip(cmp: { w: number; h: number; worst: number; swapped: boolean }, traced: { w: number; h: number }, printed: { w: number; h: number }): { text: string; tip: string } | null {
  if (cmp.worst <= 5) return null;
  const widthWorst = Math.abs(cmp.w) >= Math.abs(cmp.h);
  const pct = widthWorst ? cmp.w : cmp.h;
  const word = widthWorst ? (pct < 0 ? "narrower" : "wider") : pct < 0 ? "shallower" : "deeper";
  const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  return {
    text: `${Math.round(Math.abs(pct))}% ${word} than printed`,
    tip:
      `Traced ${traced.w.toFixed(2)} × ${traced.h.toFixed(2)} m against printed ${printed.w.toFixed(2)} × ${printed.h.toFixed(2)} m: ${signed(cmp.w)} / ${signed(cmp.h)}` +
      `${cmp.swapped ? " (printed the other way round)" : ""}. More than 5% out: check the tracing or the floor's scale.`,
  };
}
