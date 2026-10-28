import type { Floor, HouseModel, Neighbour, Opening, Pt, Room, Site, WPt } from "../../types";
import { DEFAULT_EXTERIOR, uid } from "../../types";

/**
 * The template house: two rooms on one floor, a front door, an inside door and two windows, on a rectangular plot
 * with one neighbour. `npm run house:new <id> "<Name>"` copies this folder; the tracing is then replaced, era by era,
 * with the real house (see .claude/skills/eras-tour/SKILL.md).
 *
 * Coordinates are wall centrelines in floorplan image pixels (x right, y down; the bottom of the plan is the front
 * of the house). Printed room sizes go in `dims`, in metres.
 */
export const IMG_W = 600;
export const IMG_H = 400;
const PX_PER_M = 50;

export const TEMPLATE_PRESET = { id: "_template", version: 1 };
/** The built-in plot. Bump the version whenever `templateSite()` changes. */
export const TEMPLATE_SITE_PRESET = { id: "_template-site", version: 1 };

export const rect = (name: string, x0: number, y0: number, x1: number, y1: number, dims?: { w: number; h: number }, extra: Partial<Room> = {}): Room => ({
  id: uid(),
  name,
  polygon: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  dims,
  ...extra,
});
export const poly = (name: string, pts: [number, number][], dims?: { w: number; h: number }, extra: Partial<Room> = {}): Room => ({
  id: uid(),
  name,
  polygon: pts.map(([x, y]) => ({ x, y })),
  dims,
  ...extra,
});
export const op = (kind: Opening["kind"], x: number, y: number, orientation: Opening["orientation"], widthM: number, extra: Partial<Opening> = {}): Opening => ({
  id: uid(),
  kind,
  x,
  y,
  orientation,
  widthM,
  ...extra,
});

export function templateHouse(image: string): HouseModel {
  const floor = (name: string, level: number, origin: Pt, rooms: Room[], openings: Opening[]): Floor => ({
    id: uid(),
    name,
    level,
    image,
    imageW: IMG_W,
    imageH: IMG_H,
    pxPerM: PX_PER_M,
    origin,
    offset: { x: 0, y: 0 },
    rooms,
    openings,
  });
  const ground = floor(
    "Ground Floor",
    0,
    { x: 300, y: 200 },
    [rect("Living Room", 75, 100, 325, 300, { w: 5, h: 4 }), rect("Kitchen", 325, 100, 525, 300, { w: 4, h: 4 })],
    [
      op("front", 200, 300, "h", 0.9),
      op("door", 325, 200, "v", 0.8),
      op("window", 125, 300, "h", 1.2),
      op("window", 425, 100, "h", 1.2),
    ],
  );
  return {
    floors: [ground],
    ceilingHeight: 2.4,
    slabThickness: 0.2,
    exterior: { ...DEFAULT_EXTERIOR },
    preset: { ...TEMPLATE_PRESET },
  };
}

/** Placeholder background until the real floorplan image is set. */
export function placeholderImage(): string {
  const c = document.createElement("canvas");
  c.width = IMG_W;
  c.height = IMG_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fbfbfb";
  ctx.fillRect(0, 0, IMG_W, IMG_H);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "16px sans-serif";
  ctx.fillText("Traced geometry. Use 'Set floorplan image' to show the real plan here.", 20, 30);
  return c.toDataURL("image/png");
}

const w = (pts: [number, number][]): WPt[] => pts.map(([x, y]) => ({ x, y }));

/** The plot, in metres around the house (x right, z towards the front). */
export function templateSite(): Site {
  const neighbour: Neighbour = {
    id: uid(),
    name: "Neighbour (left)",
    polygon: w([
      [-14, -4],
      [-8, -4],
      [-8, 4],
      [-14, 4],
    ]),
    eaves: 5,
    roof: "gable",
    pitchDeg: 35,
  };
  return {
    preset: { ...TEMPLATE_SITE_PRESET },
    frontBearing: 180,
    latitude: 52.4,
    longitude: -1.5,
    boundary: w([
      [-6, -14],
      [6, -14],
      [6, 8],
      [-6, 8],
    ]),
    neighbours: [neighbour],
    surfaces: [],
  };
}

export const PRESETS: Record<string, { version: number; build: (image: string) => HouseModel }> = {
  [TEMPLATE_PRESET.id]: { version: TEMPLATE_PRESET.version, build: templateHouse },
};
export const SITE_PRESETS: Record<string, { version: number; build: () => Site }> = {
  [TEMPLATE_SITE_PRESET.id]: { version: TEMPLATE_SITE_PRESET.version, build: templateSite },
};
