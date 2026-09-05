import type { Floor, HouseModel } from "../types";
import { uid } from "../types";
import { imageSize } from "./image";

/**
 * Create an empty floor from a floorplan image for manual tracing. The scale
 * is a placeholder until the user calibrates it or enters printed sizes.
 */
export async function blankFloorFromImage(imageDataUrl: string, name: string, level: number): Promise<Floor> {
  const size = await imageSize(imageDataUrl);
  return {
    id: uid(),
    name,
    level,
    image: imageDataUrl,
    imageW: size.w,
    imageH: size.h,
    pxPerM: size.w / 12,
    origin: { x: size.w / 2, y: size.h / 2 },
    offset: { x: 0, y: 0 },
    rooms: [],
    openings: [],
  };
}

export function emptyHouse(): HouseModel {
  return { floors: [], ceilingHeight: 2.4, slabThickness: 0.25 };
}

export const FLOOR_NAMES = ["Ground Floor", "First Floor", "Second Floor", "Third Floor"];
