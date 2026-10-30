import type { Fixture, Floor, HouseModel, Neighbour, Opening, Pt, Room, Site, SiteSurface, SurfaceKind, WPt } from "../../types";
import { DEFAULT_EXTERIOR, uid } from "../../types";
import { mergeRooms } from "../../lib/mergeRooms";

/**
 * The template house: a small two-storey semi (party wall on the right) with a single-storey garage on the left,
 * on a plot with a road in front. Read this file instead of another house's: every pattern a tracing needs is here,
 * under a short comment saying when to use it. `npm run house:new <id> "<Name>"` copies this folder; the tracing is
 * then replaced, era by era, with the real house (see .claude/skills/eras-tour/SKILL.md). Delete what the house lacks.
 *
 * COORDINATES. Everything on a floor is in floorplan IMAGE PIXELS: x right, y down, the bottom of the plan is the
 * FRONT of the house. Rooms are traced on the wall CENTRE-LINES; two rooms that touch share the same line (same
 * numbers), the editor draws the wall thickness each side. Openings sit on a wall line: x, y is the centre of the
 * opening, orientation "h" when the wall runs left-right, "v" when it runs up-down. Sizes are metres; 50 px = 1 m.
 * World metres (plot, roofs, neighbours) are x right, y towards the front (the same as plan y), 0,0 at `origin`.
 */
export const IMG_W = 1200;
export const IMG_H = 500;
const PX_PER_M = 50;

export const TEMPLATE_PRESET = { id: "_template", version: 1 };
/** The Proposed layout; its id follows the main one, so `house:new` renames both. Bump the version when `templateProposed()` changes. */
export const TEMPLATE_PROPOSED_PRESET = { id: `${TEMPLATE_PRESET.id}-proposed`, version: 1 };
/** The built-in plot. Bump the version whenever `templateSite()` changes. */
export const TEMPLATE_SITE_PRESET = { id: "_template-site", version: 1 };

// ---- 1. Helpers ------------------------------------------------------------------------------------------------
// rect: a rectangle room from two corners. poly: any other outline (an L, a notch), corners in order round the room.
// `dims` is the size PRINTED on the floorplan in metres (w along x): `npm run check` compares its area with the room's
// traced area and flags more than 8% apart. Leave `dims` off a room whose size is not printed.
// op: an opening. fx: a furniture or fixture by catalogue id (src/lib/catalogue.ts); rot 0 puts its back to the top
// wall (rot 90 to the right wall, 180 to the bottom, 270 to the left).
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
const fx = (type: string, x: number, y: number, rot = 0, extra: Partial<Fixture> = {}): Fixture => ({ id: uid(), type, x, y, rot, ...extra });

// ---- 2. Two floors on ONE image --------------------------------------------------------------------------------
// Estate-agent plans draw the floors side by side on one picture. Every Floor holds the same `image`; each floor's
// `origin` is the pixel that becomes world (0, 0) for that floor, so the two origins are the same point of the house
// in each drawing: here the first floor is the ground floor drawn DX pixels to the right, so its origin is DX more.
// `offset` stays 0,0 (a manual nudge in metres, only for a floor that will not line up). Then every wall above sits over
// the wall below. Check the registration with `npm run house:overlay <id> --floor 0` and `--floor 1`: each tracing
// must sit on its own drawing, and the stairs and outer walls must agree in world metres (house.test.ts checks it).
const DX = 600;
const GROUND_ORIGIN: Pt = { x: 280, y: 250 };
const FIRST_ORIGIN: Pt = { x: GROUND_ORIGIN.x + DX, y: GROUND_ORIGIN.y };

// Brick below, render above: a room's `exteriorFinish` / `exteriorColor` style its outside walls, the rest follow
// Exterior.wallFinish (section 8).
const BRICK: Partial<Room> = { exteriorFinish: "brick", exteriorColor: "#a85a40" };
const OAK_DOOR: Partial<Opening> = { style: "panel", color: "#8a6a4a", liningColor: "#ffffff" };

export function templateHouse(image: string): HouseModel {
  const floor = (name: string, level: number, origin: Pt, rooms: Room[], openings: Opening[], extra: Partial<Floor> = {}): Floor => ({
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
    ...extra,
  });

  // ---- 3. Stairs (one flight, set on the lower floor and drawn again on the upper) ------------------------------
  // `stairs` is the CENTRE of the flight in pixels; `stairsLen` its run and `stairsWidth` its width in metres.
  // `stairsDir` is the way it RISES on the plan: "up" = towards the top (the back of the house), "down" = towards the
  // front, "left" / "right" likewise. The flight here rises from the hall (foot at y 392) to the landing (head at y 232).
  // Winders: `stairsTurn` turns the bottom steps a quarter turn, entered from that side facing up the flight;
  // `stairsTopTurn` turns the top steps onto the landing towards that side (`stairsTopWinders` 2 or 3); with `stairsTopSteps` 1 to 3 it is a flat square instead, with that many rises up to the landing.
  // A STRAIGHT flight is the same without the three turn fields. Give the upper floor the same fields and the same
  // world centre (here the ground centre plus DX), and put the arrival room (Landing) over it: the app cuts the stairwell.
  // The foot's room (Hall) is boxed in under the flight; a room the flight passes over (the Cupboard) sees only a soffit.
  const stairs: Partial<Floor> = { stairsDir: "up", stairsLen: 3.2, stairsWidth: 0.9, stairsTurn: "right", stairsTopTurn: "right", stairsTopWinders: 2 };

  const ground = floor(
    "Ground Floor",
    0,
    GROUND_ORIGIN,
    [
      // ---- 4. Party wall: the right-hand wall (x 520) is shared with the semi next door. The rooms are traced exactly
      // like any other (the wall is just their edge); the house is told in Exterior.partyWall and the neighbour in
      // Site (sections 8 and 10), and the Dining room's wall here stays a plain edge with no windows.
      rect("Kitchen", 180, 100, 350, 230, { w: 3.3, h: 2.55 }, BRICK),
      rect("Dining Room", 350, 100, 520, 230, { w: 3.3, h: 2.5 }, BRICK),
      rect("Living Room", 290, 230, 520, 400, { w: 4.5, h: 3.3 }, BRICK),
      // ---- 5. Cupboard under the stairs: a small room of its own under the head of the flight, beside the hall.
      // The Hall is an L that wraps it (note its notch at 250, 300); the cupboard's door is on the shared edge x 250.
      rect("Cupboard", 180, 230, 250, 300),
      poly("Hall", [[250, 230], [290, 230], [290, 400], [180, 400], [180, 300], [250, 300]], undefined, { ...BRICK, floorFinish: "tile" }),
      // Single storey with a flat roof (nothing above it on the first floor); not heated, so out of the floor area.
      rect("Garage", 40, 150, 180, 400, { w: 2.7, h: 4.85 }, { ...BRICK, unheated: true, floorFinish: "concrete" }),
    ],
    [
      // ---- 7. Openings. kinds: front (front door), door (internal or back), window, bay, garage, patio (sliding),
      // french, bifold, archway (open, lined) and gap (open-plan, no lintel). Only set style / sill / head when the
      // plan or a photo says so; the defaults are a 0.9 m sill and 2.1 m head for windows, 2.05 m for doors.
      op("front", 262, 400, "h", 0.85, { style: "front", color: "#2f5d46" }), // front door, in the Hall's front wall beside the flight
      op("garage", 110, 400, "h", 2.4), // up-and-over garage door
      op("door", 180, 190, "v", 0.8, OAK_DOOR), // garage to kitchen
      op("door", 268, 230, "h", 0.7, OAK_DOOR), // hall to kitchen
      op("gap", 290, 340, "v", 1.0), // hall open to the living room
      op("archway", 350, 165, "v", 1.4), // kitchen to dining room: the Proposed layout knocks this through
      op("window", 265, 100, "h", 1.2, { sill: 1.0 }), // kitchen window over the worktop
      op("patio", 435, 100, "h", 2.4), // sliding doors to the garden
      // The cupboard door: low, ledged planks, in the wall the flight passes over, so its head tucks under the treads.
      op("door", 250, 265, "v", 0.7, { style: "ledged", color: "#3a2516", liningColor: "#3a2516", head: 1.75, flipHinge: true }),
      // ---- 6. A canted bay on the front: one `bay` opening on the front wall (kind "bay", `depth` is how far it
      // projects, 0.45 m here, `width` the whole bay at the wall). The room's outline stays a plain rectangle.
      // A SQUARE bay is not an opening: add its projection to the room outline (a rectangular step, e.g. corners
      // (x0, y), (x0, y + 25), (x1, y + 25), (x1, y) in place of the straight front edge) and give its three faces
      // `window` openings. Use a square bay when the plan draws a box that sticks out; a bay with angled sides is canted.
      op("bay", 405, 400, "h", 2.4, { depth: 0.45 }),
    ],
    {
      ...stairs,
      stairs: { x: 210, y: 312 },
      // Covered porch over the front door: a polygon in pixels, roofed at the ceiling (Exterior.canopyRoof).
      canopies: [[{ x: 236, y: 400 }, { x: 292, y: 400 }, { x: 292, y: 440 }, { x: 236, y: 440 }]],
      fixtures: [
        fx("sink-unit", 225, 122),
        fx("worktop-run", 310, 121, 0, { w: 1.3 }),
        fx("sofa-3", 405, 256),
        fx("table-4", 435, 160),
      ],
    },
  );

  // Every first-floor number is the ground floor's plus DX where the walls stand over each other. The rooms need not
  // match one for one: this floor has no Garage, and the Landing takes in the whole Hall and Cupboard footprint.
  const first = floor(
    "First Floor",
    1,
    FIRST_ORIGIN,
    [
      rect("Landing", DX + 180, 230, DX + 290, 400),
      rect("Bedroom 1", DX + 290, 230, DX + 520, 400, { w: 4.5, h: 3.3 }, { floorFinish: "carpet" }),
      rect("Bedroom 2", DX + 180, 100, DX + 400, 230, { w: 4.3, h: 2.5 }, { floorFinish: "carpet" }),
      rect("En-suite", DX + 400, 100, DX + 520, 230, undefined, { floorFinish: "tile" }), // small and unprinted: no dims
    ],
    [
      op("door", DX + 290, 320, "v", 0.8, OAK_DOOR), // landing to bedroom 1
      op("door", DX + 262, 230, "h", 0.8, OAK_DOOR), // landing to bedroom 2, where the head winders step off
      op("door", DX + 400, 165, "v", 0.75, OAK_DOOR), // bedroom 2 to its en-suite
      op("window", DX + 405, 400, "h", 1.5), // above the bay: first-floor sills are the same as the ground floor's
      op("window", DX + 235, 400, "h", 0.8), // landing
      op("window", DX + 290, 100, "h", 1.5),
      op("window", DX + 460, 100, "h", 0.6, { sill: 1.2 }), // en-suite
    ],
    {
      ...stairs,
      stairs: { x: 210 + DX, y: 312 }, // the same world point as the ground floor's flight
      fixtures: [fx("bed-double", DX + 405, 285), fx("toilet", DX + 430, 123), fx("basin", DX + 480, 118)],
    },
  );

  return {
    floors: [ground, first],
    ceilingHeight: 2.4,
    slabThickness: 0.2,
    // ---- 8. The exterior. These are the fields every house sets; leave the rest at DEFAULT_EXTERIOR.
    exterior: {
      ...DEFAULT_EXTERIOR,
      wallFinish: "render", // the default outside finish (rooms override it: brick on the ground floor above)
      wallColor: "#efe9d8",
      roofStyle: "hip", // slopes down at the ends; "gable" has vertical gable walls
      partyWall: "right", // ---- 4. the side the house joins its neighbour: the roof stops flush there, no overhang
      ridgeAxis: "x", // the ridge runs left-right (parallel to the street); "auto" follows the longer side
      pitchDeg: 35,
      overhang: 0.3, // the neighbour's roof must use the same pitch and overhang so the eaves line carries on
      roofColor: "#7a4a3a",
      tileStyle: "concrete",
      fascia: "white",
      gutters: true,
      canopyRoof: "lean-to", // porch roof: "flat" or a tiled slope
      // A chimney stack on the party wall at the ridge. World metres from `origin` (x right, y towards the front);
      // `height` is above the ridge it rises through. Here the party wall is at world x 4.8 and the ridge at y 0.
      chimneys: [{ id: "party-stack", x: 4.8, y: 0, w: 0.8, d: 1.0, height: 0.9, pots: 2 }],
      // The garage has a flat roof (any part with no storey above it does). Dress it with a tiled skirt across the front.
      flatRoofSkirt: { sides: ["front"], depth: 1.2, pitchDeg: 30, returns: 0.8 },
    },
    preset: { ...TEMPLATE_PRESET },
    // The total area printed on the floorplan (m²). The lint holds the model's internal area (the Report's "measured
    // like the listing" figure) to within 3% of it, which is how a wrong floorplan scale shows up. Leave it out only
    // when no total is printed.
    listedArea: 90,
  };
}

// ---- 9. A Proposed layout: the main layout plus one change. Build it FROM the main one so the two stay in step:
// copy, change, register it in PRESETS and as `proposed` in index.ts, and give it a Welcome tile there. Here the
// Kitchen and Dining Room are knocked through with `mergeRooms` (the same function the app's Knock through uses):
// it joins the two outlines and drops the archway in the wall between them.
export function templateProposed(image: string): HouseModel {
  const house = templateHouse(image);
  delete house.listedArea;
  const ground = house.floors[0];
  const kitchen = ground.rooms.find((r) => r.name === "Kitchen")!;
  const dining = ground.rooms.find((r) => r.name === "Dining Room")!;
  const merged = mergeRooms(ground, kitchen.id, dining.id, "a");
  if (!merged.ok) throw new Error(`Knock-through failed: ${merged.reason}`);
  merged.room.name = "Kitchen-diner";
  house.floors[0] = merged.floor;
  return house;
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
const block = (name: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<Neighbour>): Neighbour => ({
  id: uid(),
  name,
  polygon: w([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]),
  eaves: 2.6,
  roof: "flat",
  ...extra,
});
const surface = (kind: SurfaceKind, pts: [number, number][]): SiteSurface => ({ id: uid(), kind, polygon: w(pts) });

// ---- 10. The plot, in world metres around the house (x right, y towards the front; the house spans x -4.8 to 4.8,
// y -3 to 3). Neighbours are simple massing: a rectangle, the height of the eaves, a roof.
export function templateSite(): Site {
  const twoStorey = 5.0; // 2.4 + 0.2 + 2.4: the house's eaves
  return {
    preset: { ...TEMPLATE_SITE_PRESET },
    // These three come from the intake (the front's compass bearing, the map's latitude and longitude); they drive the
    // sun study. Round placeholders until then. 180 = the front faces due south.
    frontBearing: 180,
    latitude: 52,
    longitude: -1.5,
    // Corners round the plot. Edge i runs from boundary[i] to boundary[i + 1] and takes boundaryEdges[i].
    boundary: w([
      [-5.4, -14], // 0 rear left
      [4.8, -14], // 1 rear right, on the party line
      [4.8, 8], // 2 front right
      [0.3, 8], // 3 path gap, right post
      [-1.0, 8], // 4 path gap, left post
      [-2.1, 8], // 5 drive, right post
      [-4.7, 8], // 6 drive, left post
      [-5.4, 8], // 7 front left
    ]),
    boundaryEdges: [
      { kind: "fence", height: 1.8 }, // 0 rear
      { kind: "wall", height: 1.2, top: "brick", piers: false }, // 1 right, along the party line
      { kind: "hedge", height: 1.0 }, // 2 front, right of the path
      { kind: "open", height: 0 }, // 3 the path's gap
      { kind: "hedge", height: 1.0 }, // 4 front, between path and drive
      { kind: "open", height: 0 }, // 5 the drive's gap
      { kind: "hedge", height: 1.0 }, // 6 front, left of the drive
      { kind: "fence", height: 1.8 }, // 7 left
    ],
    neighbours: [
      // The semi next door, other half of the same building: same eaves, pitch and overhang as the house, and
      // `partySide` names the side of ITS footprint that joins ours ("left" here), so the roofs meet flush.
      block("Attached neighbour", 4.8, -3, 11.6, 3, { eaves: twoStorey, roof: "hip", ridgeAxis: "x", pitchDeg: 35, overhang: 0.3, partySide: "left", color: "#e6e3dc", roofColor: "#7a4a3a" }),
      // A detached house on the other side, with a gap: no partySide.
      block("Detached neighbour", -12.5, -2.5, -7.5, 2.5, { eaves: twoStorey, roof: "hip", ridgeAxis: "x", pitchDeg: 35, color: "#c9b8a0", roofColor: "#5a4a40" }),
    ],
    surfaces: [
      surface("pavement", [[-20, 8], [20, 8], [20, 10.5], [-20, 10.5]]),
      surface("road", [[-20, 10.5], [20, 10.5], [20, 16], [-20, 16]]),
      surface("drive", [[-4.7, 3], [-2.1, 3], [-2.1, 8], [-4.7, 8]]),
      surface("path", [[-1.0, 3.8], [0.3, 3.8], [0.3, 8], [-1.0, 8]]),
      surface("patio", [[-3, -3], [3, -3], [3, -6], [-3, -6]]),
      surface("lawn", [[-5.4, -6], [4.8, -6], [4.8, -14], [-5.4, -14]]),
    ],
  };
}

export const PRESETS: Record<string, { version: number; build: (image: string) => HouseModel }> = {
  [TEMPLATE_PRESET.id]: { version: TEMPLATE_PRESET.version, build: templateHouse },
  [TEMPLATE_PROPOSED_PRESET.id]: { version: TEMPLATE_PROPOSED_PRESET.version, build: templateProposed },
};
export const SITE_PRESETS: Record<string, { version: number; build: () => Site }> = {
  [TEMPLATE_SITE_PRESET.id]: { version: TEMPLATE_SITE_PRESET.version, build: templateSite },
};
