import type { Floor, HouseModel, Opening, Pt, Room } from "../../types";
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
      rect("Kitchen (galley)", 530, 22, 730, 160, { w: 3.05, h: 1.86 }, { exteriorColor: BRICK }),
      rect("Kitchen", 730, 22, 975, 345, { w: 3.18, h: 4.38 }),
      rect("Garage", 530, 160, 730, 515, { w: 2.69, h: 4.91 }, { exteriorColor: BRICK }),
      rect("Living Room (rear)", 975, 22, 1290, 278, { w: 4.45, h: 3.32 }),
      rect("Living Room (front)", 1045, 278, 1290, 515, { w: 3.40, h: 3.26 }),
      poly("Hallway (stairs)", [
        [815, 345],
        [975, 345],
        [975, 278],
        [1045, 278],
        [1045, 515],
        [815, 515],
      ]),
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
        { exteriorColor: BRICK },
      ),
    ],
    [
      op("door", 665, 22, "h", 0.85), // back door
      op("window", 760, 22, "h", 0.9),
      op("window", 910, 22, "h", 1.7),
      op("window", 1145, 22, "h", 2.9),
      op("door", 730, 91, "v", 1.86), // galley open to kitchen
      op("door", 1170, 278, "h", 2.0), // opening between the two living rooms
      op("bay", 1185, 515, "h", 2.4), // bay window on the front living room
      op("door", 1045, 410, "v", 0.8), // hall -> front living room
      op("door", 770, 345, "h", 0.8), // kitchen -> front hall
      op("door", 950, 345, "h", 0.8), // kitchen -> stairs hall
      op("door", 960, 515, "h", 0.8), // stairs hall -> front hall
      op("door", 730, 575, "v", 0.9, { color: "#b3202e" }), // front door (red)
      op("window", 860, 620, "h", 1.6),
      op("window", 990, 620, "h", 1.0),
      op("window", 1045, 570, "v", 0.8),
      op("door", 630, 515, "h", 2.4, { style: "garage", color: "#b3202e" }), // garage door
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

  const first = base(
    "Floor 1",
    1,
    { x: 650, y: 1203 },
    [
      rect("Bedroom 1", 610, 795, 775, 1040, { w: 2.23, h: 3.33 }),
      rect("Bedroom 2", 775, 795, 1020, 1040, { w: 3.47, h: 3.32 }),
      poly("Bedroom 3", [
        [850, 1040],
        [1020, 1040],
        [1020, 795],
        [1075, 795],
        [1075, 1285],
        [850, 1285],
      ]),
      rect("Landing", 610, 1040, 850, 1110),
      poly("Bathroom", [
        [690, 1110],
        [810, 1110],
        [810, 1285],
        [610, 1285],
        [610, 1215],
        [690, 1215],
      ]),
      rect("Stairs", 610, 1110, 690, 1215),
    ],
    [
      op("door", 745, 1040, "h", 0.8),
      op("door", 805, 1040, "h", 0.8),
      op("door", 850, 1075, "v", 0.8),
      op("door", 750, 1110, "h", 0.75),
      op("door", 690, 1160, "v", 0.9), // stairs open to landing
      op("window", 720, 795, "h", 1.2),
      op("window", 915, 795, "h", 2.4),
      op("window", 750, 1285, "h", 0.9),
      op("window", 980, 1285, "h", 1.2),
      op("window", 610, 1080, "v", 0.6),
    ],
    { x: 650, y: 1162 },
  );

  return {
    floors: [ground, first],
    ceilingHeight: 2.4,
    slabThickness: 0.25,
    // From the photos: cream render, brown frames, tiled roof with the ridge
    // parallel to the street (left-right on the plan).
    exterior: { ...DEFAULT_EXTERIOR, ridgeAxis: "x", pitchDeg: 35, roofColor: "#6e4a3c", wallColor: RENDER, trimColor: "#4a2e1e" },
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
  const first = house.floors.find((f) => f.level === 1)!;
  // Spans the extension footprint below: garage west wall to the stair
  // enclosure wall, full depth of the existing first floor.
  const newRoom = rect("New Room", 315, 795, 610, 1285, { w: 3.59, h: 6.77 }, { exteriorColor: BRICK, roofGroup: "extension" });
  first.rooms.push(newRoom);
  first.openings.push(
    op("door", 610, 1075, "v", 0.8), // from the landing (assumed)
    op("window", 470, 795, "h", 1.8), // north (assumed)
    op("window", 470, 1285, "h", 1.8), // south (assumed)
  );
  return house;
}
