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
  /** Colour of this room's external walls (e.g. brick vs render). */
  exteriorColor?: string;
  /** Rooms sharing a roofGroup get their own gable when the extension roof is "separate". */
  roofGroup?: string;
}

export interface Opening {
  id: string;
  /** "bay" is a window that projects outward; "garage" is a panelled up-and-over door. */
  kind: "door" | "window" | "bay" | "garage";
  color?: string;
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
  /** Direction the flight rises in, in plan terms. Default "up" (towards the top of the plan). */
  stairsDir?: StairsDir;
  /** Length of the flight along its run, metres. Default 2.6. */
  stairsLen?: number;
  /** Width of the flight, metres. Default 0.9. */
  stairsWidth?: number;
  /** Covered outdoor areas (porch, carport): polygons in image px, roofed at this floor's ceiling. */
  canopies?: Pt[][];
}

export type StairsDir = "up" | "down" | "left" | "right";
export const STAIRS_DIR_LABEL: Record<StairsDir, string> = {
  up: "Rises towards the top of the plan",
  down: "Rises towards the bottom of the plan",
  left: "Rises towards the left",
  right: "Rises towards the right",
};

export interface Exterior {
  showRoof: boolean;
  /** Ridge direction for gable roofs; "auto" follows the longer side. x = left-right on the plan. */
  ridgeAxis: "auto" | "x" | "z";
  pitchDeg: number;
  overhang: number;
  /** Whether rooms tagged with a roofGroup share the main gable or get a separate lower one. */
  extensionRoof: "continue" | "separate";
  roofColor: string;
  wallColor: string;
  trimColor: string;
}

export const DEFAULT_EXTERIOR: Exterior = {
  showRoof: true,
  ridgeAxis: "auto",
  pitchDeg: 35,
  overhang: 0.35,
  extensionRoof: "continue",
  roofColor: "#7a4a3a",
  wallColor: "#efe9d8",
  trimColor: "#4a2e1e",
};

export interface HouseModel {
  floors: Floor[];
  /** Floor-to-ceiling height in metres. */
  ceilingHeight: number;
  /** Structural slab thickness between floors, metres. */
  slabThickness: number;
  exterior?: Exterior;
  /** Set on built-in models so the app can offer an update when the tracing improves. */
  preset?: { id: string; version: number };
}

export interface Photo {
  id: string;
  name: string;
  dataUrl: string;
  /** Assigned location, by floor name + room name so it survives re-extraction. */
  floorName?: string;
  roomName?: string;
  /** For exterior photos: which side of the house they show. front = bottom of the plan. */
  elevation?: Elevation;
  description?: string;
  confidence?: number;
}

export type Elevation = "front" | "rear" | "left" | "right";
export const ELEVATION_LABEL: Record<Elevation, string> = {
  front: "Front (bottom of plan)",
  rear: "Rear (top of plan)",
  left: "Left side",
  right: "Right side",
};

export type VariantKey = "current" | "proposed";

export const VARIANT_LABEL: Record<VariantKey, string> = {
  current: "As listed",
  proposed: "Proposed",
};

export const uid = () => Math.random().toString(36).slice(2, 10);
