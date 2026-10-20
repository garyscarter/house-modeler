import type { Floor, HouseModel, Neighbour, Opening, Pt, Room, Site, SiteSurface, WPt } from "../../types";
import { DEFAULT_EXTERIOR, uid } from "../../types";

/**
 * Rightmove listing 91770873, traced from the Giraffe360 floorplan image
 * (2000 x 1414 px). Coordinates are wall centrelines in that image.
 * Printed room sizes are stored as dims; scale is about 73 px/m.
 */
const IMG_W = 2000;
const IMG_H = 1414;
const PX_PER_M = 73;

const BRICK = "#a8553a";
const RENDER = "#efe9d8";

const rect = (name: string, x0: number, y0: number, x1: number, y1: number, dims?: { w: number; h: number }, extra: Partial<Room> = {}): Room => ({
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
const poly = (name: string, pts: [number, number][], dims?: { w: number; h: number }, extra: Partial<Room> = {}): Room => ({
  id: uid(),
  name,
  polygon: pts.map(([x, y]) => ({ x, y })),
  dims,
  ...extra,
});
const op = (
  kind: Opening["kind"],
  x: number,
  y: number,
  orientation: Opening["orientation"],
  widthM: number,
  extra: Partial<Opening> = {},
): Opening => ({
  id: uid(),
  kind,
  x,
  y,
  orientation,
  widthM,
  ...extra,
});

export const LISTING_PRESET = { id: "listing-91770873", version: 13 };
export const LISTING_PROPOSED_PRESET = { id: "listing-91770873-proposed", version: 13 };

export function listing91770873(image: string): HouseModel {
  const base = (name: string, level: number, origin: Pt, rooms: Room[], openings: Opening[], stairs: Pt, canopies?: Pt[][]): Floor => ({
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
    stairs,
    canopies,
  });

  const ground = base(
    "Ground Floor",
    0,
    { x: 865, y: 430 },
    [
      // The galley's rear wall is rendered like the house (rear photos); its front is hidden by the garage.
      // Interior finishes are from the photos. The galley (galley-2, kitchen-4) shares the kitchen's
      // octagon vinyl. Its cooker wall and back-door wall are 1970s splashback squares, cream
      // shading to brown; the wall to the garage (edge 2) is yellow-red brick in gold mortar.
      rect("Kitchen (galley)", 530, 22, 730, 160, { w: 3.05, h: 1.86 }, {
        floorFinish: "vinyl",
        color: "#b38862",
        wallCovering: "squares",
        wallPaint: "#f0e0bb",
        wallAccent: "#a5662f",
        wallFinishes: { 2: { covering: "brick", paint: "#cf9670", accent: "#d6b46e" } },
      }),
      // White paper with large red flowers. The rear wall with the pier between the windows
      // (edge 0; kitchen-1, -4) is red brick, and the wall to the garage (edge 3; kitchen-3)
      // carries on the galley's yellow brick.
      rect("Kitchen", 730, 22, 975, 345, { w: 3.18, h: 4.38 }, {
        floorFinish: "vinyl",
        color: "#b38862",
        wallCovering: "floral",
        wallPaint: "#f3f0ec",
        wallAccent: "#c8364a",
        wallFinishes: { 0: { covering: "brick", paint: "#c06a4a", accent: "#ddcca6" }, 3: { covering: "brick", paint: "#cf9670", accent: "#d6b46e" } },
      }),
      // Brick, except the front wall (edge 2) set back under the porch roof: cream render round the garage door
      // (front-3, front-2). The brick pier at the porch's front-left corner and the hall's side wall by the
      // front door stay brick.
      rect("Garage", 530, 160, 730, 515, { w: 2.69, h: 4.91 }, {
        exteriorColor: BRICK,
        exteriorFinish: "brick",
        floorFinish: "concrete",
        wallFinishes: { 2: { outside: { finish: "render", color: RENDER } } },
      }),
      // Cream and grey-beige stripes in both rooms; the rear room's chimney-breast wall on the party
      // wall (edge 1) has a cream paper with large gold flowers and grey leaves (living-rear-1, -3).
      rect("Living Room (rear)", 975, 22, 1290, 278, { w: 4.45, h: 3.32 }, {
        floorFinish: "carpet",
        color: "#d6cfc4",
        wallCovering: "stripe",
        wallPaint: "#efe8da",
        wallAccent: "#cdc1ab",
        wallFinishes: { 1: { covering: "rose", paint: "#f4f0e6", accent: "#c9b44e" } },
      }),
      rect("Living Room (front)", 1045, 278, 1290, 515, { w: 3.40, h: 3.26 }, { floorFinish: "carpet", color: "#d6cfc4", wallCovering: "stripe", wallPaint: "#efe8da", wallAccent: "#cdc1ab" }),
      // Pale grey-oak laminate; cream walls, with a paper of leaves and red buds only on the stair
      // wall (edge 5, along the flight's west side; hall-stairs-1, -2).
      poly("Hallway (stairs)", [
        [815, 345],
        [975, 345],
        [975, 278],
        [1045, 278],
        [1045, 515],
        [815, 515],
      ], undefined, {
        floorFinish: "laminate",
        color: "#c4b59f",
        wallPaint: "#f1ece2",
        wallFinishes: { 5: { covering: "trail", paint: "#f1ece2", accent: "#c9503f" } },
      }),
      poly(
        "Hallway (front)",
        [
          [730, 345],
          [815, 345],
          [815, 515],
          [1045, 515],
          [1045, 620],
          [730, 620],
        ],
        undefined,
        // Red quarry tiles and plain white walls (hall-front-1, galley-1).
        { exteriorColor: BRICK, exteriorFinish: "brick", floorFinish: "quarry", color: "#9a4a35", wallPaint: "#f3f1ec" },
      ),
    ],
    [
      // Back door and the galley window beside it: the plan draws the door 571-636 and the window
      // 657-780 with a 0.3 m pier between; rear-1 agrees once its perspective is fitted to the other
      // rear openings. The window is about 1.7 m wide and 1.15 m tall, its sill a tile course above the
      // worktop (kitchen-1, -4) and its head a little above the door's (rear-1).
      op("door", 604, 22, "h", 0.85), // back door
      op("window", 719, 22, "h", 1.7, { sill: 1.0, head: 2.15 }),
      op("window", 910, 22, "h", 1.7, { sill: 1.0, head: 2.15 }), // level with the galley window (rear photos)
      op("patio", 1145, 22, "h", 2.9), // sliding patio doors to the garden
      op("gap", 730, 91, "v", 1.8), // galley open to kitchen
      op("bifold", 1170, 278, "h", 2.0), // bi-fold between the two living rooms
      { ...op("bay", 1185, 515, "h", 2.4), depth: 0.3 }, // shallow canted bay on the front living room (photos)
      op("door", 1045, 410, "v", 0.8), // hall -> front living room
      op("door", 770, 345, "h", 0.8), // kitchen -> front hall
      op("door", 950, 345, "h", 0.8), // kitchen -> stairs hall
      op("door", 960, 515, "h", 0.8), // stairs hall -> front hall
      op("front", 730, 575, "v", 0.9, { color: "#4f2f22" }), // front door (dark brown, glazed)
      op("window", 830, 620, "h", 0.85),
      op("window", 962, 620, "h", 0.9),
      op("window", 1045, 570, "v", 0.8),
      op("garage", 630, 515, "h", 2.4, { color: "#b3202e" }), // garage door
    ],
    { x: 865, y: 430 },
    // Covered porch in front of the garage door and front door.
    [
      [
        { x: 530, y: 515 },
        { x: 730, y: 515 },
        { x: 730, y: 620 },
        { x: 530, y: 620 },
      ],
    ],
  );
  // Ground-floor flight rises towards the top of the plan, arriving at the landing.
  // Its bottom steps wind a quarter turn so you step on from the hall side (photos).
  ground.stairsDir = "up";
  ground.stairsLen = 2.3;
  ground.stairsWidth = 0.9;
  ground.stairsTurn = "right";

  const first = base(
    "Floor 1",
    1,
    { x: 650, y: 1203 },
    [
      // Cream paper with a small blue motif.
      rect("Bedroom 1", 610, 795, 775, 1040, { w: 2.23, h: 3.33 }, { floorFinish: "carpet", color: "#cbbdab", wallCovering: "sprig", wallPaint: "#efe7d4", wallAccent: "#6f8fc4" }),
      // Includes its fitted wardrobe along the party wall (a fixture below). Pale mint paint.
      rect("Bedroom 2", 775, 795, 1075, 1040, { w: 3.47, h: 3.32 }, { floorFinish: "carpet", color: "#d0c4b4", wallPaint: "#d9e5d2" }),
      // Takes in the strip west of the room that the plan labels "Cupboard": it is the fitted wardrobe (photos).
      poly(
        "Bedroom 3",
        [
          [850, 1040],
          [1075, 1040],
          [1075, 1285],
          [810, 1285],
          [810, 1110],
          [850, 1110],
        ],
        { w: 3.28, h: 3.36 },
        { floorFinish: "laminate", color: "#cdb48e", wallPaint: "#c9b3bd" },
      ),
      rect("Landing", 610, 1040, 850, 1110, undefined, { floorFinish: "carpet", color: "#bdae9f", wallPaint: "#f1eee8" }),
      // Beige tiles floor to ceiling with travertine mosaic strips.
      poly("Bathroom", [
        [690, 1110],
        [810, 1110],
        [810, 1285],
        [610, 1285],
        [610, 1215],
        [690, 1215],
      ], undefined, { floorFinish: "tile", color: "#d3c3ab", wallCovering: "tiles", wallPaint: "#dccdbb", wallAccent: "#cdbb9f" }),
      rect("Stairs", 610, 1110, 690, 1215, undefined, { floorFinish: "carpet", color: "#bdae9f", wallPaint: "#f1eee8" }),
    ],
    [
      op("door", 745, 1040, "h", 0.8),
      op("door", 805, 1040, "h", 0.8),
      op("door", 850, 1075, "v", 0.8),
      op("door", 750, 1110, "h", 0.75),
      op("gap", 650, 1110, "h", 0.8), // stairs open onto the landing
      op("window", 720, 795, "h", 1.0),
      op("window", 930, 795, "h", 1.85),
      op("window", 750, 1285, "h", 0.65, { sill: 1.2 }),
      op("window", 972, 1285, "h", 0.95),
      op("window", 610, 1080, "v", 0.6),
    ],
    { x: 650, y: 1162 },
  );
  // Fitted wardrobes from the photos, backs against the walls at their inner faces
  // (the party wall is 0.25 m thick, internal walls 0.1 m). rot 90 turns the back to
  // the east, 270 to the west.
  first.fixtures = [
    // Bedroom 2: light grey, floor to ceiling along the party wall (the grey strip on the plan).
    { id: uid(), type: "wardrobe-shaker", x: 1044, y: 920, rot: 90, w: 3.15, d: 0.6, color: "#d3d6da" },
    // Bedroom 3: white, in the strip beside the room door.
    { id: uid(), type: "wardrobe-fitted", x: 833, y: 1195, rot: 270, w: 2.2, d: 0.55 },
  ];

  return {
    floors: [ground, first],
    ceilingHeight: 2.4,
    slabThickness: 0.25,
    // From the photos: cream render, brown frames, tiled roof with the ridge
    // parallel to the street (left-right on the plan).
    // Hipped at the garage end; the right-hand side is the party wall with No. 26.
    exterior: {
      ...DEFAULT_EXTERIOR,
      roofStyle: "hip",
      partyWall: "right",
      ridgeAxis: "x",
      pitchDeg: 35,
      roofColor: "#6e4a3c",
      wallColor: RENDER,
      wallFinish: "render",
      trimColor: "#4a2e1e",
      // Brown uPVC fascias and gutters, concrete interlocking tiles (front photos).
      fascia: "trim",
      tileStyle: "concrete",
      // One brick stack on the party wall near the ridge, shared with No. 26
      // (chimney breasts are drawn on that wall on both floors of the plan).
      chimneys: [{ id: "party-stack", x: 5.82, y: -2.4, w: 0.9, d: 0.6, height: 0.9, pots: 2 }],
      // The single-storey part has a flat roof dressed with a tiled skirt across the
      // front, over the porch, garage and hall, hipped at both ends (front-street,
      // front-2). It rises about 0.9 m, right up to the two-storey wall over the hall
      // (front-1): set deeper than that, it stops against the wall. It returns round
      // the corners: on the right all the way back to the two-storey wall, on the left
      // a short way down the garage side (length assumed), since the rear photos show
      // nothing rising above the plain flat edge at the back (rear-1, rear-4).
      flatRoofSkirt: { sides: ["front"], depth: 1.8, pitchDeg: 30, returns: 2.0 },
    },
    preset: LISTING_PRESET,
    // Giraffe360 floorplan, IPMS 3C, garage included (the EPC gives 114 m²).
    listedArea: 113.9,
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
  ctx.font = "28px sans-serif";
  ctx.fillText("Rightmove listing 91770873 — traced geometry. Use 'Set floorplan image' to show the real plan here.", 60, 720);
  return c.toDataURL("image/png");
}

/**
 * Proposed layout: the single-storey side extension (galley kitchen + garage
 * + lobby) gains a first floor, forming one "New Room" beside Bedroom 1, the
 * landing and the stairs. Ground floor is unchanged.
 */
export function listing91770873Proposed(image: string): HouseModel {
  const house = listing91770873(image);
  delete house.listedArea;
  const first = house.floors.find((f) => f.level === 1)!;
  // Spans the extension footprint below: garage west wall to the stair
  // enclosure wall, full depth of the existing first floor.
  // Rendered to match the house above the brick ground floor.
  const newRoom = rect("New Room", 315, 795, 610, 1285, { w: 3.59, h: 6.77 }, { roofGroup: "extension" });
  first.rooms.push(newRoom);
  first.openings.push(
    op("door", 610, 1075, "v", 0.8), // from the landing (assumed)
    op("window", 470, 795, "h", 1.8), // north (assumed)
    op("window", 470, 1285, "h", 1.8), // south (assumed)
  );
  return house;
}

/** Registry of built-in models, so the app can offer an update when a tracing improves. */
export const PRESETS: Record<string, { version: number; build: (image: string) => HouseModel }> = {
  [LISTING_PRESET.id]: { version: LISTING_PRESET.version, build: listing91770873 },
  [LISTING_PROPOSED_PRESET.id]: { version: LISTING_PROPOSED_PRESET.version, build: listing91770873Proposed },
};

const w = (pts: [number, number][]): WPt[] => pts.map(([x, y]) => ({ x, y }));
const block = (name: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<Neighbour>): Neighbour => ({
  id: uid(),
  name,
  polygon: w([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]),
  eaves: 2.6,
  roof: "flat",
  ...extra,
});
const surface = (kind: SiteSurface["kind"], pts: [number, number][]): SiteSurface => ({ id: uid(), kind, polygon: w(pts) });

/**
 * Plot, neighbours and orientation for the listing, measured from the
 * OS-based drainage search map and scaled so the house outline matches the
 * traced model (it agrees to within 0.15 m). World metres in the model frame:
 * x to the right, y towards the street. Map accuracy is roughly +/-0.3 m.
 * Heights of the neighbours' extensions are assumed (single storey).
 */
export function listingSite(): Site {
  // Two-storey eaves: two 2.4 m storeys, a 0.25 m slab, and the ground floor
  // sitting 0.26 m above the garden.
  const twoStorey = 5.3;
  return {
    frontBearing: 162,
    latitude: 51.44,
    longitude: -2.62,
    boundary: w([
      [-4.44, -11.24],
      [5.84, -12.05],
      [5.67, 5.5],
      [-1.85, 5.5],
      [-4.88, 5.5],
    ]),
    // Low brick wall with coping along the front garden; the drive is open.
    boundaryEdges: [
      { kind: "fence", height: 1.8 },
      { kind: "fence", height: 1.8 },
      { kind: "wall", height: 0.9 },
      { kind: "open", height: 0 },
      { kind: "fence", height: 1.8 },
    ],
    neighbours: [
      // Pale render with a brick band, sharing our roof covering.
      block("No. 26 (attached)", 5.82, -5.59, 12.2, 1.12, { eaves: twoStorey, roof: "hip", ridgeAxis: "x", pitchDeg: 35, partySide: "left", color: "#e6e3dc", roofColor: "#6e4a3c" }),
      // A white uPVC conservatory (rear photos).
      block("No. 26 conservatory", 5.82, -9.41, 8.64, -5.59, { eaves: 2.4, roof: "flat", color: "#eef1f1", roofColor: "#dfe6e8" }),
      block("No. 26 side extension", 12.2, -5.59, 15.2, -1.98, { eaves: 2.6, roof: "flat" }),
      // Red brick with a red clay-tile hipped roof (front photos).
      block("West neighbour", -12.8, -6.15, -6.36, 0.78, { eaves: twoStorey, roof: "hip", ridgeAxis: "x", pitchDeg: 35, partySide: "left", color: "#a5583f", roofColor: "#a14e36" }),
      block("Outbuilding behind the garden", -7.7, -15.1, 1.4, -11.5, { eaves: 2.4, roof: "flat" }),
    ],
    surfaces: [
      surface("patio", [
        [-4.59, -5.59],
        [5.78, -5.59],
        [5.8, -8.0],
        [-4.53, -8.0],
      ]),
      surface("lawn", [
        [-4.53, -8.0],
        [5.8, -8.0],
        [5.84, -12.05],
        [-4.44, -11.24],
      ]),
      surface("drive", [
        [-4.59, 1.16],
        [-1.85, 1.16],
        [-1.85, 5.5],
        [-4.88, 5.5],
      ]),
      // The front hall projects to x = 2.47 (ground floor plan px 1045).
      surface("lawn", [
        [-1.85, 2.6],
        [2.47, 2.6],
        [2.47, 1.16],
        [5.78, 1.16],
        [5.67, 5.5],
        [-1.85, 5.5],
      ]),
      surface("pavement", [
        [-16, 5.5],
        [18, 5.5],
        [18, 7.5],
        [-16, 7.5],
      ]),
      surface("road", [
        [-16, 7.5],
        [18, 7.5],
        [18, 14.0],
        [-16, 14.0],
      ]),
      surface("pavement", [
        [-16, 14.0],
        [18, 14.0],
        [18, 16.0],
        [-16, 16.0],
      ]),
    ],
  };
}
