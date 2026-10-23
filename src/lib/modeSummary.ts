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
import { areaM2, axisRect, formatArea } from "./planMath";
import { bbox, pointInPolygon } from "./geometry";
import { isUnheated } from "./report";
import { swatchName } from "./paintPalette";
import { exteriorOf } from "./roof";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const colourName = (hex: string) => swatchName(hex) ?? hex;
const dirWord = (d: string) => d[0].toUpperCase() + d.slice(1);

/** "7 rooms · 58.2 m² · 12 doors and windows · stairs up" */
export function buildSummary(floor: Floor): string {
  if (!floor.rooms.length) return "No rooms yet";
  const area = floor.rooms.reduce((s, r) => s + areaM2(r.polygon, floor.pxPerM), 0);
  const parts = [plural(floor.rooms.length, "room", "rooms"), `${area.toFixed(1)} m²`];
  const n = floor.openings.length;
  if (n) parts.push(n === 1 ? "1 door or window" : `${n} doors and windows`);
  if (floor.stairs) parts.push("stairs up");
  return parts.join(" · ");
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

/** "14 items · Kitchen 5, Living room 4 … · 1 overlap" */
export function furnishSummary(floor: Floor, clashes: number): string {
  const fixtures = floor.fixtures ?? [];
  if (!fixtures.length) return "No furniture yet";
  const parts = [plural(fixtures.length, "item", "items")];
  const per = new Map<string, number>();
  for (const f of fixtures) {
    const room = floor.rooms.find((r) => pointInPolygon(f, r.polygon));
    if (room) per.set(room.name, (per.get(room.name) ?? 0) + 1);
  }
  const sorted = [...per].sort((a, b) => b[1] - a[1]);
  if (sorted.length) parts.push(sorted.slice(0, 2).map(([n, c]) => `${n} ${c}`).join(", ") + (sorted.length > 2 ? " …" : ""));
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

/** "2 neighbouring rooms" */
export const knockSummary = (n: number) => plural(n, "neighbouring room", "neighbouring rooms");

/** "Herringbone wood or LVT · 45° · #c8a97e" */
export function floorSummary(room: Room): string {
  const parts: string[] = [FLOOR_FINISH_LABEL[room.floorFinish ?? "plain"]];
  if (room.floorAngle) parts.push(`${Math.round(room.floorAngle)}°`);
  if (room.color) parts.push(room.color);
  return parts.join(" · ");
}

/** "Paint · Warm white · skirting white" */
export function wallsSummary(room: Room): string {
  const parts: string[] = [WALL_COVERING_LABEL[room.wallCovering ?? "paint"]];
  if (room.wallPaint) parts.push(colourName(room.wallPaint));
  parts.push(`skirting ${room.skirtingColor ? colourName(room.skirtingColor) : "white"}`);
  return parts.join(" · ");
}

/** "2 of 4 walls have their own finish" */
export function eachWallSummary(room: Room): string {
  const n = room.polygon.length;
  const k = featureKeys(room).length;
  if (!k) return `All ${n} walls follow the room`;
  return `${k} of ${n} walls ${k === 1 ? "has its" : "have their"} own finish`;
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

/** "Level 0 · 41.3 px/m" */
export const floorSettingsSummary = (floor: Floor) => `Level ${floor.level} · ${floor.pxPerM.toFixed(1)} px/m`;

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
