import type { Floor, HouseModel, Opening, Room } from "../types";
import { uid } from "../types";

/**
 * A small built-in semi-detached house so the viewer can be explored before
 * any floorplan has been extracted. Coordinates are in a fake 800x600 image
 * at 60 px/m.
 */
export function sampleHouse(): HouseModel {
  const S = 60;
  const rect = (name: string, x: number, y: number, w: number, h: number): Room => ({
    id: uid(),
    name,
    polygon: [
      { x: x * S, y: y * S },
      { x: (x + w) * S, y: y * S },
      { x: (x + w) * S, y: (y + h) * S },
      { x: x * S, y: (y + h) * S },
    ],
    dims: { w, h },
  });
  const op = (kind: Opening["kind"], x: number, y: number, orientation: Opening["orientation"], widthM = kind === "door" ? 0.85 : 1.4): Opening => ({
    id: uid(),
    kind,
    x: x * S,
    y: y * S,
    orientation,
    widthM,
  });
  const image = blankImage(800, 700);
  const base = (name: string, level: number, rooms: Room[], openings: Opening[], stairs?: { x: number; y: number }): Floor => ({
    id: uid(),
    name,
    level,
    image,
    imageW: 800,
    imageH: 700,
    pxPerM: S,
    origin: { x: 4.5 * S, y: 5 * S },
    offset: { x: 0, y: 0 },
    rooms,
    openings,
    stairs,
  });

  const ground = base(
    "Ground Floor",
    0,
    [
      rect("Living Room", 1, 1, 4, 4.5),
      rect("Hall", 5, 1, 2, 4.5),
      rect("Dining Room", 7, 1, 3, 3.5),
      rect("Kitchen", 5, 5.5, 5, 3.5),
      rect("WC", 7, 4.5, 1.5, 1),
      rect("Utility", 1, 5.5, 4, 3.5),
    ],
    [
      op("door", 6, 1, "h"), // front door
      op("door", 5, 3, "v"),
      op("door", 7, 2.5, "v"),
      op("door", 6, 5.5, "h"),
      op("door", 7.75, 4.5, "h", 0.75),
      op("door", 5, 7, "v"),
      op("door", 8, 9, "h", 2.4), // patio doors
      op("window", 3, 1, "h", 2.2),
      op("window", 8.5, 1, "h", 1.6),
      op("window", 1, 3.5, "v"),
      op("window", 2.5, 9, "h", 1.6),
      op("window", 10, 7, "v"),
    ],
    { x: 6 * S, y: 4.3 * S },
  );

  const first = base(
    "First Floor",
    1,
    [
      rect("Bedroom 1", 1, 1, 4, 4.5),
      rect("Landing", 5, 1, 2, 4.5),
      rect("Bedroom 2", 7, 1, 3, 3.5),
      rect("Bathroom", 7, 4.5, 3, 2),
      rect("Bedroom 3", 5, 6.5, 5, 2.5),
      rect("Bedroom 4", 1, 5.5, 4, 3.5),
    ],
    [
      op("door", 5, 2.5, "v"),
      op("door", 7, 2, "v"),
      op("door", 7, 5.2, "v"),
      op("door", 6, 6.5, "h"),
      op("door", 4, 5.5, "h"),
      op("window", 3, 1, "h", 2.0),
      op("window", 8.5, 1, "h", 1.6),
      op("window", 10, 5.5, "v", 0.9),
      op("window", 7.5, 9, "h", 1.6),
      op("window", 2.5, 9, "h", 1.6),
    ],
    { x: 6 * S, y: 4.3 * S },
  );

  return { floors: [ground, first], ceilingHeight: 2.4, slabThickness: 0.25 };
}

function blankImage(w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#999";
  ctx.font = "20px sans-serif";
  ctx.fillText("Sample house (no floorplan image)", 20, 40);
  return c.toDataURL("image/png");
}
