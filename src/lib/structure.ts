import type { Floor, HouseModel } from "../types";

/**
 * Structural signatures: strings that change when a floor's geometry changes
 * and stay the same when only its looks change (room colours, floor and wall
 * finishes, opening colours, fixtures, names, notes). The 3D view keys its
 * expensive memos on these so a colour-picker step does not rebuild every
 * floor's shell, the stairs and the roof.
 *
 * Cosmetic fields are listed here and everything else counts as structure, so
 * a new field that affects geometry is picked up by default.
 */
const ROOM_COSMETIC = new Set(["color", "notes", "floorPhotoId", "floorFinish", "floorAngle", "floorGrout", "wallPaint", "wallCovering", "wallAccent", "wallFinishes", "skirtingColor", "unheated"]);
const OPENING_COSMETIC = new Set(["color", "boardColor", "liningColor", "frameColor"]);
// The plan image is a large data URL and only the numbers read from it matter.
const FLOOR_SKIPPED = new Set(["image", "name", "rooms", "openings", "fixtures"]);

function without(obj: object, skip: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!skip.has(k)) out[k] = v;
  return out;
}

const cache = new WeakMap<Floor, { withOpenings?: string; bare?: string }>();

/** Signature of one floor's geometry. Openings only matter to some consumers (stairwells), so they are optional. */
export function floorStructure(floor: Floor, withOpenings = true): string {
  const hit = cache.get(floor) ?? {};
  const known = withOpenings ? hit.withOpenings : hit.bare;
  if (known !== undefined) return known;
  const data: Record<string, unknown> = {
    ...without(floor, FLOOR_SKIPPED),
    imageW: floor.imageW,
    imageH: floor.imageH,
    rooms: floor.rooms.map((r) => without(r, ROOM_COSMETIC)),
  };
  if (withOpenings) data.openings = floor.openings.map((o) => without(o, OPENING_COSMETIC));
  const sig = JSON.stringify(data);
  cache.set(floor, { ...hit, [withOpenings ? "withOpenings" : "bare"]: sig });
  return sig;
}

// What only the room's floor surface (or the UI) reads; the wall shell and walls ignore these. The wall
// coverings, skirting and exterior colour are read by the shell and so are not listed.
const ROOM_SURFACE_ONLY = new Set(["name", "color", "notes", "floorPhotoId", "floorFinish", "floorAngle", "floorGrout", "unheated"]);
const SHELL_SKIPPED = new Set(["image", "name", "fixtures"]);
const looksCache = new WeakMap<Floor, string>();

/**
 * Signature of everything the wall shell reads from a floor: the geometry plus
 * the wall, opening and skirting looks. Unlike `floorStructure` it counts wall
 * paint and opening colours, but still ignores fixtures and floor-surface
 * fields, so moving a sofa or recolouring a floor does not rebuild the walls.
 */
export function shellLooks(floor: Floor): string {
  const hit = looksCache.get(floor);
  if (hit !== undefined) return hit;
  const sig = JSON.stringify({
    ...without(floor, SHELL_SKIPPED),
    imageW: floor.imageW,
    imageH: floor.imageH,
    rooms: floor.rooms.map((r) => without(r, ROOM_SURFACE_ONLY)),
  });
  looksCache.set(floor, sig);
  return sig;
}

export function floorsStructure(floors: Floor[], withOpenings = true): string {
  return floors.map((f) => floorStructure(f, withOpenings)).join("|");
}

/** Everything the stairwells, balustrades and floor shells read from the model, bar colours and finishes. */
export function modelStructure(model: Pick<HouseModel, "floors" | "ceilingHeight" | "slabThickness">): string {
  return `${model.ceilingHeight}/${model.slabThickness}#${floorsStructure(model.floors)}`;
}

/** Everything `planRoofs` reads: the rooms and canopies of every floor, the heights and the exterior settings. */
export function roofStructure(model: Pick<HouseModel, "floors" | "ceilingHeight" | "slabThickness" | "exterior">): string {
  return `${model.ceilingHeight}/${model.slabThickness}#${floorsStructure(model.floors, false)}#${JSON.stringify(model.exterior ?? {})}`;
}

/** Everything the flight from `floor` (its treads and boxing-in) reads. */
export function flightStructure(model: Pick<HouseModel, "ceilingHeight" | "slabThickness">, floor: Floor): string {
  return `${model.ceilingHeight}/${model.slabThickness}#${floorStructure(floor, false)}`;
}
