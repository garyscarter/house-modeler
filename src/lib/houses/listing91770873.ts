import type { Floor, HouseModel, Neighbour, Opening, Pt, Room, Site, SiteSurface, SurfaceFinish, WPt } from "../../types";
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

// Downstairs the skirting is dark stained mahogany (the front hall's is quarry tile); upstairs it is white.
const DARK_SKIRTING = "#3e2418";
const QUARRY_SKIRTING = "#8f4632";
// Warm oatmeal carpets (the renderer's sky light cools floors, so these read a little lighter than they print).
const CARPET_LIVING = "#e6dac8";
const CARPET_BEDROOM = "#e6dac8";
const CARPET_STAIRS = "#dfd0ba";
// Cream bathroom floor tiles (bathroom-1, -2, -wc).
const BATHROOM_FLOOR = "#e6d9bf";

// Joinery from the photos.
/** Downstairs internal doors: dark-stained mahogany with 15 small panes and dark linings (kitchen-2, galley-1, hall-front-1). */
const MAHOGANY_DOOR: Partial<Opening> = { style: "glazed-15", color: "#3e2418", liningColor: "#3e2418" };
/** Upstairs: white six-panel doors with white architraves (landing-1, bedroom-3-3). */
const WHITE_DOOR: Partial<Opening> = { style: "six-panel", color: "#f2f0ea" };
/** Brown uPVC windows have only a thin uPVC sill outside, no stone sill (front-2, rear-1). */
const UPVC: Partial<Opening> = { sillStyle: "upvc" };
/** Downstairs the window boards are dark tile (hall-front-1, kitchen-1). */
const TILE_BOARD: Partial<Opening> = { ...UPVC, boardColor: "#3d2e28" };

export const LISTING_PRESET = { id: "listing-91770873", version: 15 };
export const LISTING_PROPOSED_PRESET = { id: "listing-91770873-proposed", version: 15 };

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
        skirtingColor: DARK_SKIRTING,
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
        skirtingColor: DARK_SKIRTING,
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
      // Cream and grey-beige stripes in both rooms. The chimney breast stands on the party wall
      // where the plan draws it (faces at x 1253, y 97 and 210; the notch edges are wall centre
      // lines, 9 px in from those faces), projecting about 0.38 m with an alcove either side.
      // The breast and both alcoves (edges 1-5) have a cream paper with large gold flowers and grey
      // leaves (living-rear-1, -3).
      poly(
        "Living Room (rear)",
        [
          [975, 22],
          [1290, 22],
          [1290, 106],
          [1262, 106],
          [1262, 201],
          [1290, 201],
          [1290, 278],
          [975, 278],
        ],
        { w: 4.45, h: 3.32 },
        {
          floorFinish: "carpet",
          color: CARPET_LIVING,
          skirtingColor: DARK_SKIRTING,
          wallCovering: "stripe",
          wallPaint: "#efe8da",
          wallAccent: "#cdc1ab",
          wallFinishes: Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, { covering: "rose" as const, paint: "#f4f0e6", accent: "#c9b44e" }])),
        },
      ),
      rect("Living Room (front)", 1045, 278, 1290, 515, { w: 3.40, h: 3.26 }, { floorFinish: "carpet", color: CARPET_LIVING, skirtingColor: DARK_SKIRTING, wallCovering: "stripe", wallPaint: "#efe8da", wallAccent: "#cdc1ab" }),
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
        skirtingColor: DARK_SKIRTING,
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
        { exteriorColor: BRICK, exteriorFinish: "brick", floorFinish: "quarry", color: "#9a4a35", skirtingColor: QUARRY_SKIRTING, wallPaint: "#f3f1ec" },
      ),
    ],
    [
      // Back door and the galley window beside it: the plan draws the door 571-636 and the window
      // 657-780 with a 0.3 m pier between; rear-1 agrees once its perspective is fitted to the other
      // rear openings. The window is about 1.7 m wide and 1.15 m tall, its sill a tile course above the
      // worktop (kitchen-1, -4) and its head a little above the door's (rear-1).
      // The back door is dark brown uPVC, shut, obscure-glazed over a solid lower half (rear-1, galley-2).
      op("door", 604, 22, "h", 0.85, { style: "half-glazed", color: "#3b2219", openDeg: 0 }), // back door
      // Both rear windows are one large fixed pane under two top lights (rear-1, kitchen-1).
      op("window", 719, 22, "h", 1.7, { sill: 1.0, head: 2.15, glazing: "fixed-top", ...TILE_BOARD }),
      op("window", 910, 22, "h", 1.7, { sill: 1.0, head: 2.15, glazing: "fixed-top", ...TILE_BOARD }), // level with the galley window (rear photos)
      op("patio", 1145, 22, "h", 2.9), // sliding patio doors to the garden
      op("gap", 730, 91, "v", 1.8), // galley open to kitchen
      op("archway", 1170, 278, "h", 2.0), // open archway between the two living rooms, lined in dark stained timber (not bi-folds)
      // Each bay face is a large fixed pane under a narrow top light (front-2).
      { ...op("bay", 1185, 515, "h", 2.4), depth: 0.3, glazing: "fixed-top", ...UPVC }, // shallow canted bay on the front living room (photos)
      op("door", 1045, 410, "v", 0.8, MAHOGANY_DOOR), // hall -> front living room
      op("door", 770, 345, "h", 0.8, MAHOGANY_DOOR), // kitchen -> front hall
      op("door", 950, 345, "h", 0.8, MAHOGANY_DOOR), // kitchen -> stairs hall
      op("door", 960, 515, "h", 0.8, MAHOGANY_DOOR), // stairs hall -> front hall
      // Glazed door across the corridor from the front hall to the kitchen, hung on its east jamb
      // (plan: leaf 745-805 at y 443, opening north; galley-1). It sits in a short partition (ground.walls below).
      op("door", 772, 443, "h", 0.85, { ...MAHOGANY_DOOR, flipHinge: true, flipSwing: true }),
      // Ledged plank door from the kitchen to the cupboard under the top of the stairs (plan: the grey
      // cupboard at x 836-900, y 345-405, its door 836-890; kitchen-2: latch on the west, so hung on
      // the east jamb, opening into the kitchen).
      op("door", 863, 345, "h", 0.7, { style: "ledged", color: "#3a2516", liningColor: "#3a2516", flipHinge: true, flipSwing: true }),
      // Serving hatch from the kitchen to the rear living room. On the kitchen side a dark timber frame
      // about 1.25 m wide (y 110-202) sits over the returned units, but only its south half is open,
      // glazed with frosted sliding panes; the north half is a papered panel (kitchen-1, -2). The living
      // room side shows just that opening (living-rear-2). Fitted to kitchen-1's perspective.
      op("window", 975, 170, "v", 0.65, { sill: 1.0, head: 1.45, glazing: "fixed", sillStyle: "none" }),
      // Two leaded obscure panes over two panels (hall-front-1, front-3).
      op("front", 730, 575, "v", 0.9, { color: "#4f2f22", style: "half-glazed-2" }), // front door (dark brown, glazed)
      // Hall windows: a fixed pane under a top-hung top light (front-2); the side one is barred (galley-1).
      op("window", 830, 620, "h", 0.85, { glazing: "fixed-top", ...TILE_BOARD }),
      op("window", 962, 620, "h", 0.9, { glazing: "fixed-top", ...TILE_BOARD }),
      op("window", 1045, 570, "v", 0.8, { glazing: "fixed-top", ...TILE_BOARD }),
      // A single up-and-over leaf with 3 x 2 raised panels in a white frame, 2.15 m wide: a cream nib about
      // 0.5 m wide on its left (partly hidden by the porch pier in front-3) and a thin one on its right.
      op("garage", 635, 515, "h", 2.15, { color: "#b3202e", style: "up-over", frameColor: "#f2efe6" }), // garage door
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
  // The partition holding the glazed door across the corridor between the front hall and the kitchen,
  // and the back of the rear living room's chimney breast: the notch leaves the party wall open there,
  // so a 0.1 m wall flush with the party wall's outer face (1290 + 9 px) closes it.
  ground.walls = [
    { id: uid(), a: { x: 730, y: 443 }, b: { x: 815, y: 443 } },
    { id: uid(), a: { x: 1295.5, y: 106 }, b: { x: 1295.5, y: 201 }, color: RENDER },
  ];
  // Kitchen and galley units from the photos (kitchen-1 to -4, galley-2): cream shaker doors and a dark
  // speckled worktop. Backs sit at the walls' inner faces (rear wall 0.25 m thick, so y 31.1; the
  // kitchen's east wall and the galley's wall to the garage 0.1 m; the galley's west wall 0.25 m).
  // rot 0 backs onto the rear wall, 90 onto the east, 270 onto the west.
  const UNITS = "#efe6cf";
  const TOP = "#3a3032";
  ground.fixtures = [
    // Along the rear wall from the back door's jamb to the east wall: a washing-machine space at the
    // galley/kitchen junction, the sink under the galley window, then units to the corner.
    { id: uid(), type: "washing-machine", x: 660, y: 53, rot: 0 },
    { id: uid(), type: "sink-unit", x: 718.4, y: 53, rot: 0, color: UNITS, worktop: TOP },
    { id: uid(), type: "worktop-run", x: 863.1, y: 53, rot: 0, w: 2.965, color: UNITS, worktop: TOP },
    // Returning down the kitchen's east wall under the serving hatch.
    { id: uid(), type: "worktop-run", x: 949.45, y: 115.1, rot: 90, w: 1.1, color: UNITS, worktop: TOP },
    // The galley's west wall, from the rear wall: a base unit, a gas hob over a double oven, and an
    // under-counter fridge against the brick wall to the garage. Kept 0.5 m deep so the run stops at
    // the back door's jamb (plan 571).
    { id: uid(), type: "base-unit", x: 557.4, y: 51.75, rot: 270, w: 0.565, d: 0.5, color: UNITS, worktop: TOP },
    { id: uid(), type: "cooker", x: 557.4, y: 94.27, rot: 270, d: 0.5, color: "#1f2023", label: "Gas hob, double oven" },
    { id: uid(), type: "fridge-freezer", x: 557.4, y: 136.25, rot: 270, w: 0.55, d: 0.5, h: 0.85, color: "#f2f1ec", label: "Fridge" },
    // Three cream wall units, the middle one short over a black canopy hood.
    { id: uid(), type: "wall-unit", x: 551.17, y: 51.75, rot: 270, w: 0.565, color: UNITS },
    { id: uid(), type: "cooker-hood", x: 555.55, y: 94.27, rot: 270, color: UNITS },
    { id: uid(), type: "wall-unit", x: 551.17, y: 136.25, rot: 270, w: 0.55, color: UNITS },
    // Rear living room: carved mahogany surround on the chimney breast's face (x 1253), marble hearth.
    { id: uid(), type: "fireplace", x: 1234.6, y: 153.5, rot: 90 },
  ];

  const first = base(
    "Floor 1",
    1,
    { x: 650, y: 1203 },
    [
      // Cream paper with a small blue motif.
      rect("Bedroom 1", 610, 795, 775, 1040, { w: 2.23, h: 3.33 }, { floorFinish: "carpet", color: CARPET_BEDROOM, wallCovering: "sprig", wallPaint: "#efe7d4", wallAccent: "#6f8fc4" }),
      // Includes its fitted wardrobe along the party wall (a fixture below). Pale mint paint.
      rect("Bedroom 2", 775, 795, 1075, 1040, { w: 3.47, h: 3.32 }, { floorFinish: "carpet", color: CARPET_BEDROOM, wallPaint: "#d9e5d2" }),
      // Takes in the strip west of the room that the plan labels "Cupboard": it is the fitted wardrobe (photos).
      // A chimney breast fills its north-east corner on the party wall (plan x 1050-1075, y 1040-1112;
      // bedroom-3-2), notched at wall centre lines 9 px in from its faces and kept more than 0.25 m off
      // the party wall's line so the two stay separate walls. Only the party wall and the breast
      // (edges 1-3) are dusky mauve; the other walls are a very pale lilac-grey (bedroom-3-1 to -3).
      poly(
        "Bedroom 3",
        [
          [850, 1040],
          [1056, 1040],
          [1056, 1103],
          [1075, 1103],
          [1075, 1285],
          [810, 1285],
          [810, 1110],
          [850, 1110],
        ],
        { w: 3.28, h: 3.36 },
        {
          floorFinish: "laminate",
          color: "#cdb48e",
          wallPaint: "#e3dce0",
          wallFinishes: Object.fromEntries([1, 2, 3].map((i) => [i, { covering: "paint" as const, paint: "#a68b97" }])),
        },
      ),
      rect("Landing", 610, 1040, 850, 1110, undefined, { floorFinish: "carpet", color: CARPET_STAIRS, wallPaint: "#f1eee8" }),
      // Beige tiles floor to ceiling with travertine mosaic strips.
      poly("Bathroom", [
        [690, 1110],
        [810, 1110],
        [810, 1285],
        [610, 1285],
        [610, 1215],
        [690, 1215],
      ], undefined, { floorFinish: "tile", color: BATHROOM_FLOOR, wallCovering: "tiles", wallPaint: "#dccdbb", wallAccent: "#cdbb9f" }),
      rect("Stairs", 610, 1110, 690, 1215, undefined, { floorFinish: "carpet", color: CARPET_STAIRS, wallPaint: "#f1eee8" }),
    ],
    [
      op("door", 745, 1040, "h", 0.8, WHITE_DOOR),
      op("door", 805, 1040, "h", 0.8, WHITE_DOOR),
      op("door", 850, 1075, "v", 0.8, WHITE_DOOR),
      op("door", 722, 1110, "h", 0.65, WHITE_DOOR), // west of the shower (floorplan)
      op("gap", 650, 1110, "h", 0.8), // stairs open onto the landing
      // Bedroom 1, the bathroom and bedroom 3: one pane under a top light; bedroom 2: side casements
      // either side of a fixed centre pane under a top light (rear-1, front-2).
      op("window", 720, 795, "h", 1.0, { glazing: "fixed-top", ...UPVC }),
      op("window", 930, 795, "h", 1.85, { glazing: "casement-fixed-casement", ...UPVC }),
      op("window", 750, 1285, "h", 0.65, { sill: 1.2, glazing: "fixed-top", ...UPVC }),
      op("window", 972, 1285, "h", 0.95, { glazing: "fixed-top", ...UPVC }),
      op("window", 610, 1080, "v", 0.6, UPVC),
    ],
    { x: 650, y: 1162 },
  );
  // Back of Bedroom 3's chimney breast, closing the party wall behind its notch (as on the ground floor).
  first.walls = [{ id: uid(), a: { x: 1080.5, y: 1040 }, b: { x: 1080.5, y: 1103 }, color: RENDER }];
  // Fitted wardrobes from the photos, backs against the walls at their inner faces
  // (the party wall is 0.25 m thick, internal walls 0.1 m). rot 90 turns the back to
  // the east, 270 to the west.
  first.fixtures = [
    // Bedroom 2: light grey, floor to ceiling along the party wall (the grey strip on the plan).
    { id: uid(), type: "wardrobe-shaker", x: 1044, y: 920, rot: 90, w: 3.15, d: 0.6, color: "#d3d6da" },
    // Bedroom 3: white, in the strip beside the room door.
    { id: uid(), type: "wardrobe-fitted", x: 833, y: 1195, rot: 270, w: 2.2, d: 0.55 },
    // Bedroom 1: blue-grey with cream beading, a double plus a single, in the south-west corner by the door
    // (bedroom-1-1). The desk run's drawer pedestals are in the same colour along the west wall up to the
    // window end (bedroom-1-2); both are shortened a little to fit the 3.3 m room.
    { id: uid(), type: "wardrobe-shaker", x: 637, y: 981, rot: 270, w: 1.5, d: 0.6, color: "#c9d0d8" },
    { id: uid(), type: "custom", x: 633, y: 862, rot: 270, w: 1.7, d: 0.5, h: 0.75, color: "#c9d0d8", label: "Fitted desk" },
    // Bathroom: rectangular shower with a sliding door in the north-east corner (door side to the west),
    // gloss white vanity and mirror cabinet on the east wall, WC in the west alcove and a chrome ladder rail
    // on the wall beside it (bathroom-1, bathroom-2, bathroom-wc).
    { id: uid(), type: "shower", x: 777, y: 1153, rot: 90, w: 1.0, d: 0.7, color: "#cfe3ec" },
    { id: uid(), type: "vanity", x: 790, y: 1225, rot: 90, w: 0.65, d: 0.45, color: "#f6f6f4" },
    { id: uid(), type: "wall-unit", x: 801, y: 1225, rot: 90, w: 0.65, d: 0.15, h: 0.6, color: "#eef1f2", label: "Mirror cabinet" },
    { id: uid(), type: "toilet", x: 639, y: 1250, rot: 270 },
    { id: uid(), type: "towel-rail", x: 697, y: 1185, rot: 270, w: 0.5, h: 1.5, color: "#dfe3e6" },
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
    op("door", 610, 1075, "v", 0.8, WHITE_DOOR), // from the landing (assumed)
    op("window", 470, 795, "h", 1.8, UPVC), // north (assumed)
    op("window", 470, 1285, "h", 1.8, UPVC), // south (assumed)
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
/** A brick-kerbed bed standing about 0.3 m proud of the ground. */
const RAISED_BED: SiteSurface["slope"] = { toward: "back", rise: 0, base: 0.3 };

/**
 * What the listing's hard surfaces are laid with: the drive is dark grey tarmac with a raised kerb against
 * the lawn (front-3, front-1), the rear patio is small weathered dark grey and red block paving (rear-garden,
 * rear-2, rear-4). Applied by kind so every drive and patio surface of the plot gets it.
 */
const LISTING_FINISH: Partial<Record<SiteSurface["kind"], SurfaceFinish>> = { drive: "tarmac", patio: "block-weathered" };

const surface = (kind: SiteSurface["kind"], pts: [number, number][], slope?: SiteSurface["slope"]): SiteSurface => ({
  id: uid(),
  kind,
  polygon: w(pts),
  ...(LISTING_FINISH[kind] ? { finish: LISTING_FINISH[kind] } : {}),
  ...(slope ? { slope } : {}),
});

/**
 * The drive rises gently from the pavement (ground level) to the garage door
 * (front-3, front-street): no step at the door, only a thin threshold. The
 * ground floor's finished level is 0.26 m above the ground, so the drive tops
 * out 0.02 m under it at the garage door.
 */
const DRIVE_RISE = 0.24;

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
      [-4.44, -11.24], // 0 rear-west
      [5.84, -12.05], // 1 rear-east
      // East side: brick wall with a pierced block panel beside No. 26's
      // conservatory (rear-3), then the house's party wall.
      [5.81, -9.41], // 2
      [5.78, -5.59], // 3
      [5.67, 5.5], // 4 front-east
      [-1.85, 5.5], // 5 drive, east edge
      [-4.88, 5.5], // 6 front-west
      // West side: brick wall up the drive to the garage-front pier, the
      // garage wall itself, a brick wall with a block panel and bin store
      // at the back of the house (rear-1, rear-2, rear-4), then hedge.
      // The wall ends under the porch pillar (canopy corner at x -4.589,
      // z 2.60), centred so its street face is flush with the pillar's.
      [-4.626, 2.6], // 7 wall meets the pillar
      [-4.59, 1.2], // 8
      [-4.59, -5.59], // 9
      [-4.55, -7.0], // 10
    ]),
    // Edge i runs from boundary[i] to boundary[i + 1].
    boundaryEdges: [
      { kind: "fence", height: 1.8 }, // 0 rear: not visible in any photo
      { kind: "fence", height: 1.8 }, // 1 east, back garden: not visible
      { kind: "wall", height: 1.4, top: "brick", piers: false }, // 2 east, beside No. 26's conservatory
      { kind: "fence", height: 1.8 }, // 3 east, along the party wall (hidden)
      { kind: "wall", height: 0.9, top: "brick", piers: false }, // 4 front garden wall
      { kind: "open", height: 0 }, // 5 drive opening
      { kind: "wall", height: 1, top: "brick", piers: false }, // 6 west side of the drive
      { kind: "fence", height: 1.8 }, // 7 west, beside the pillar (hidden)
      { kind: "fence", height: 1.8 }, // 8 west, along the garage wall (hidden)
      { kind: "wall", height: 1.3, top: "brick", piers: false }, // 9 west, rear corner of the house
      { kind: "hedge", height: 2 }, // 10 west, back garden
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
      // The patio runs about 4 m out from the rear wall to the raised brick-kerbed shrub bed (rear-garden, rear-2, rear-4).
      surface("patio", [
        [-4.59, -5.59],
        [5.78, -5.59],
        [5.8, -9.6],
        [-4.53, -9.6],
      ]),
      // Long raised bed along the back of the patio, parallel to the house, with a conifer (rear-garden).
      surface(
        "bed",
        [
          [-4.53, -9.6],
          [5.8, -9.6],
          [5.82, -10.5],
          [-4.5, -10.5],
        ],
        RAISED_BED,
      ),
      // Curved raised planter in front of the patio doors (rear-3, rear-4), as a polygon.
      surface("bed", Array.from({ length: 20 }, (_, i) => [4.1 + 1.5 * Math.cos((i / 20) * Math.PI * 2), -7.2 + 0.8 * Math.sin((i / 20) * Math.PI * 2)] as [number, number]), RAISED_BED),
      surface("lawn", [
        [-4.5, -10.5],
        [5.82, -10.5],
        [5.84, -12.05],
        [-4.44, -11.24],
      ]),
      // Pavement to garage door (z 5.5 back to 1.16), rising DRIVE_RISE; the porch floor and
      // the front door's landing (z about 1.2 to 2.6, x -1.85 edge) are the top of this ramp.
      surface(
        "drive",
        [
          [-4.59, 1.16],
          [-1.85, 1.16],
          [-1.85, 5.5],
          [-4.88, 5.5],
        ],
        { toward: "back", rise: DRIVE_RISE },
      ),
      // Paving along the front of the hall, kerbed from the lawn (front-3). It carries on from the
      // drive's east edge, so it starts at the drive's height there and falls a little away from the wall.
      surface(
        "path",
        [
          [-1.85, 2.6],
          [2.47, 2.6],
          [2.47, 3.5],
          [-1.85, 3.5],
        ],
        { toward: "back", rise: 0.05, base: 0.11 }, // the drive is 0.11 m up at z 3.5 and 0.16 m at z 2.6
      ),
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
