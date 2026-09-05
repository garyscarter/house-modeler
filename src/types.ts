/** A point in floorplan image pixel coordinates. */
export interface Pt {
  x: number;
  y: number;
}

export interface Room {
  id: string;
  name: string;
  /** Polygon in image pixel coordinates. */
  polygon: Pt[];
  /** Printed dimensions from the plan, in metres, if any. */
  dims?: { w: number; h: number };
  /** Photo used as the floor texture, if any. */
  floorPhotoId?: string;
  color?: string;
}

export interface Opening {
  id: string;
  kind: "door" | "window";
  /** Centre of the opening, image pixel coordinates. */
  x: number;
  y: number;
  /** "h" means the wall it sits in runs left-right on the plan. */
  orientation: "h" | "v";
  /** Width along the wall, in metres. */
  widthM: number;
}

export interface Floor {
  id: string;
  name: string;
  /** 0 = ground, 1 = first, -1 = basement. */
  level: number;
  /** Source floorplan image (data URL). */
  image: string;
  imageW: number;
  imageH: number;
  /** Image pixels per metre. */
  pxPerM: number;
  /** Pixel point mapped to world (0, 0) before offset. */
  origin: Pt;
  /** Manual nudge in metres so floors stack correctly. */
  offset: { x: number; y: number };
  rooms: Room[];
  openings: Opening[];
  stairs?: Pt;
}

export interface HouseModel {
  floors: Floor[];
  /** Floor-to-ceiling height in metres. */
  ceilingHeight: number;
  /** Structural slab thickness between floors, metres. */
  slabThickness: number;
}

export interface Photo {
  id: string;
  name: string;
  dataUrl: string;
  /** Assigned location, by floor name + room name so it survives re-extraction. */
  floorName?: string;
  roomName?: string;
  description?: string;
  confidence?: number;
}

export type VariantKey = "current" | "proposed";

export const VARIANT_LABEL: Record<VariantKey, string> = {
  current: "As listed",
  proposed: "Proposed",
};

export const uid = () => Math.random().toString(36).slice(2, 10);
