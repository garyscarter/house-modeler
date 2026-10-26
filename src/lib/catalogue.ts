import type { JoineryConfig } from "../types";

/**
 * Furniture and fixture catalogue with typical UK sizes, in metres.
 * `w` is the width left-right on the plan at rotation 0, `d` the depth top-bottom,
 * `h` the height. The back of an item is its top edge on the plan (local -y),
 * so wall snapping puts that edge against the wall. Add entries here to extend
 * the palette.
 */
export type Symbol =
  | "bed"
  | "cot"
  | "toilet"
  | "basin"
  | "vanity"
  | "shower"
  | "quadrant"
  | "bath"
  | "towel-rail"
  | "box"
  | "car"
  | "sofa"
  | "corner-sofa"
  | "low-sofa"
  | "chaise-sofa"
  | "lounge-chair"
  | "pouf"
  | "round-table"
  | "media-unit"
  | "tv-wall"
  | "tv-stand"
  | "floor-lamp"
  | "rug"
  | "table"
  | "chair"
  | "appliance"
  | "washer"
  | "cabinet"
  | "wall-cabinet"
  | "worktop"
  | "sink"
  | "hob"
  | "oven"
  | "tall"
  | "range"
  | "island"
  | "shelves"
  | "dresser"
  | "fitted-wardrobe"
  | "shaker-wardrobe"
  | "boiler"
  | "radiator"
  | "column-radiator"
  | "hood"
  | "fireplace"
  | "mirror"
  | "mirror-round"
  | "mirror-cabinet"
  | "mirror-lit"
  | "american-fridge"
  | "handleless"
  | "drawers"
  | "oven-pair"
  | "wine-cooler"
  | "waterfall"
  | "corner-unit"
  | "corner-unit-handleless"
  | "corner-diagonal"
  | "corner-diagonal-handleless"
  | "peninsula"
  | "peninsula-handleless"
  | "stool"
  | "stool-back"
  | "gas-hob"
  | "induction"
  | "vented-hob"
  | "glass-hood"
  | "box-hood"
  | "island-hood"
  | "beanbag"
  | "beanbag-chair"
  | "wood-armchair"
  | "corner-tv"
  | "cube-shelves"
  | "table-lamp"
  | "desk-lamp"
  | "chimney-hood"
  | "shelf"
  | "built-in"
  | "window-seat"
  | "wall-box";

export interface CatalogueItem {
  id: string;
  name: string;
  category: string;
  w: number;
  d: number;
  h: number;
  color: string;
  symbol: Symbol;
  /** Height of the item's base above the floor, metres, for wall-hung and worktop items. */
  mount?: number;
  /** Floor-to-ceiling items (fitted wardrobes): as tall as the room unless set lower, and never taller. */
  toCeiling?: boolean;
  note?: string;
  /** Id of the owner's MyPiece this entry stands for (see lib/myFurniture.ts). */
  piece?: string;
  /** Default joinery settings (see lib/joinery.ts). */
  joinery?: JoineryConfig;
}

/** Kitchen carcass colour shared by the units so a run reads as one kitchen. */
const UNIT = "#e0dccf";
const WOOD = "#c9a26b";
const WALNUT = "#6b4a2f";
const STAINLESS = "#b9bdc2";
const PAINTED = "#ece9e1";
/** Worktop colour of kitchen units unless a fixture sets its own. */
export const DEFAULT_WORKTOP = "#4a4d52";

/** Doors across a fitted wardrobe of width `w` metres; the plan symbol and the 3D model both divide it this way. */
export function wardrobeDoorCount(symbol: Symbol, w: number): number {
  return Math.max(1, Math.round(w / (symbol === "shaker-wardrobe" ? 0.45 : 0.55)));
}

export const CATALOGUE: CatalogueItem[] = [
  // Beds: UK mattress sizes plus ~5 cm of frame each way
  { id: "bed-single", name: "Single bed", category: "Bedroom", w: 0.95, d: 1.95, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 90 × 190 cm" },
  { id: "bed-small-double", name: "Small double bed", category: "Bedroom", w: 1.25, d: 1.95, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 120 × 190 cm" },
  { id: "bed-double", name: "Double bed", category: "Bedroom", w: 1.40, d: 1.95, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 135 × 190 cm" },
  { id: "bed-king", name: "King bed", category: "Bedroom", w: 1.55, d: 2.05, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 150 × 200 cm" },
  { id: "bed-super-king", name: "Super king bed", category: "Bedroom", w: 1.85, d: 2.05, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 180 × 200 cm" },
  { id: "cot", name: "Cot", category: "Bedroom", w: 1.24, d: 0.66, h: 0.9, color: "#f3efe6", symbol: "cot", note: "Mattress 120 × 60 cm" },
  { id: "bedside", name: "Bedside table", category: "Bedroom", w: 0.45, d: 0.40, h: 0.55, color: WOOD, symbol: "box" },
  { id: "table-lamp-small", name: "Bedside lamp", category: "Bedroom", w: 0.24, d: 0.24, h: 0.4, color: "#e9d9c4", symbol: "table-lamp", mount: 0.55, note: "A small lamp for a bedside table; set the height above the floor to the table's top" },
  { id: "wardrobe-double", name: "Double wardrobe", category: "Bedroom", w: 1.00, d: 0.60, h: 2.0, color: WOOD, symbol: "box" },
  { id: "wardrobe-triple", name: "Triple wardrobe", category: "Bedroom", w: 1.50, d: 0.60, h: 2.0, color: WOOD, symbol: "box" },
  { id: "wardrobe-fitted", name: "Fitted wardrobe", category: "Bedroom", w: 1.80, d: 0.60, h: 2.4, color: "#f5f5f5", symbol: "fitted-wardrobe", toCeiling: true, note: "Floor to ceiling, with top boxes; set any width" },
  { id: "wardrobe-shaker", name: "Fitted wardrobe (shaker)", category: "Bedroom", w: 1.80, d: 0.60, h: 2.4, color: "#cfd2d6", symbol: "shaker-wardrobe", toCeiling: true, note: "Floor to ceiling, framed doors with knobs; set any width" },
  { id: "chest", name: "Chest of drawers", category: "Bedroom", w: 0.80, d: 0.45, h: 0.9, color: WOOD, symbol: "box" },
  { id: "dressing-table", name: "Dressing table", category: "Bedroom", w: 1.00, d: 0.45, h: 0.76, color: WOOD, symbol: "dresser", note: "With a mirror above" },

  // Bathroom
  { id: "toilet", name: "Toilet", category: "Bathroom", w: 0.38, d: 0.68, h: 0.8, color: "#ffffff", symbol: "toilet", note: "Close-coupled WC" },
  { id: "basin", name: "Basin (standard)", category: "Bathroom", w: 0.55, d: 0.45, h: 0.85, color: "#ffffff", symbol: "basin" },
  { id: "basin-compact", name: "Basin (compact)", category: "Bathroom", w: 0.40, d: 0.30, h: 0.85, color: "#ffffff", symbol: "basin", note: "Cloakroom size" },
  { id: "vanity", name: "Vanity unit", category: "Bathroom", w: 0.60, d: 0.45, h: 0.85, color: "#8fa3b0", symbol: "vanity", note: "Basin on a two-drawer unit" },
  { id: "shower", name: "Shower (standard)", category: "Bathroom", w: 0.80, d: 0.80, h: 2.0, color: "#cfe3ec", symbol: "shower" },
  { id: "shower-900", name: "Shower (900)", category: "Bathroom", w: 0.90, d: 0.90, h: 2.0, color: "#cfe3ec", symbol: "shower" },
  { id: "shower-quadrant", name: "Quadrant shower", category: "Bathroom", w: 0.90, d: 0.90, h: 2.0, color: "#cfe3ec", symbol: "quadrant", note: "Curved front; fits into a corner" },
  { id: "shower-walkin", name: "Shower (walk-in)", category: "Bathroom", w: 1.20, d: 0.90, h: 2.0, color: "#cfe3ec", symbol: "shower" },
  { id: "bath", name: "Bath (standard)", category: "Bathroom", w: 1.70, d: 0.70, h: 0.55, color: "#ffffff", symbol: "bath" },
  { id: "bath-1800", name: "Bath (1800)", category: "Bathroom", w: 1.80, d: 0.80, h: 0.55, color: "#ffffff", symbol: "bath" },
  { id: "bath-small", name: "Bath (small)", category: "Bathroom", w: 1.50, d: 0.70, h: 0.55, color: "#ffffff", symbol: "bath" },
  { id: "mirror", name: "Mirror (rectangular)", category: "Bathroom", w: 0.60, d: 0.02, h: 0.80, color: "#b8bcc2", symbol: "mirror", mount: 1.1, note: "Wall-hung; colour is the frame, set the height to suit" },
  { id: "mirror-round", name: "Mirror (round)", category: "Bathroom", w: 0.60, d: 0.02, h: 0.60, color: "#b8bcc2", symbol: "mirror-round", mount: 1.2, note: "Wall-hung; width and height set the oval" },
  { id: "mirror-cabinet", name: "Mirror cabinet", category: "Bathroom", w: 0.60, d: 0.15, h: 0.70, color: "#f2f2f2", symbol: "mirror-cabinet", mount: 1.2, note: "Wall-hung, mirrored doors" },
  { id: "mirror-lit", name: "Illuminated mirror", category: "Bathroom", w: 0.60, d: 0.04, h: 0.80, color: "#b8bcc2", symbol: "mirror-lit", mount: 1.1, note: "Wall-hung, softly lit edge" },
  { id: "towel-rail", name: "Heated towel rail", category: "Bathroom", w: 0.50, d: 0.10, h: 1.2, color: "#c8ccd1", symbol: "towel-rail", mount: 0.15, note: "Wall-hung" },

  // Living
  { id: "sofa-3", name: "Sofa (3 seat)", category: "Living", w: 2.00, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "sofa-2", name: "Sofa (2 seat)", category: "Living", w: 1.60, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "sofa-corner", name: "Corner sofa", category: "Living", w: 2.50, d: 1.90, h: 0.85, color: "#9ab0c8", symbol: "corner-sofa", note: "L-shaped; the short arm is on the left" },
  { id: "armchair", name: "Armchair", category: "Living", w: 0.90, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "coffee-table", name: "Coffee table", category: "Living", w: 1.00, d: 0.50, h: 0.45, color: WOOD, symbol: "table" },
  { id: "tv-unit", name: "TV unit", category: "Living", w: 1.20, d: 0.40, h: 0.5, color: WOOD, symbol: "box" },
  { id: "tv-unit-corner", name: "Corner TV unit", category: "Living", w: 1.2, d: 1.2, h: 0.5, color: WOOD, symbol: "corner-tv", note: "Fits into a room corner with a flat or curved front (set in the inspector); width and depth are the legs along the two walls. Put a TV on a stand on top, turned 45°" },
  { id: "cube-2x2", name: "Cube shelving 2 × 2 (Kallax-style)", category: "Living", w: 0.77, d: 0.39, h: 0.77, color: PAINTED, symbol: "cube-shelves", note: "Open cubes 0.385 m square, no back; resize for more cubes" },
  { id: "cube-2x4", name: "Cube shelving 2 × 4, wide (Kallax-style)", category: "Living", w: 1.47, d: 0.39, h: 0.77, color: PAINTED, symbol: "cube-shelves", note: "A low run of eight cubes; a TV or plants on top" },
  { id: "cube-4x4", name: "Cube shelving 4 × 4 (Kallax-style)", category: "Living", w: 1.47, d: 0.39, h: 1.47, color: PAINTED, symbol: "cube-shelves", note: "Sixteen open cubes; works as a room divider" },
  { id: "cube-1x4", name: "Cube shelving 1 × 4, tall (Kallax-style)", category: "Living", w: 0.42, d: 0.39, h: 1.47, color: PAINTED, symbol: "cube-shelves", note: "A single column of four cubes" },
  { id: "tv-wall", name: "TV, wall-mounted", category: "Living", w: 1.23, d: 0.08, h: 0.71, color: "#15171a", symbol: "tv-wall", mount: 1.0, note: "55 inch to start; pick the screen size in the inspector. Screen bottom 1 m up; set the height to suit your seating" },
  { id: "tv-stand", name: "TV on a stand", category: "Living", w: 1.23, d: 0.25, h: 0.76, color: "#15171a", symbol: "tv-stand", mount: 0.5, note: "55 inch to start; pick the screen size in the inspector. Sits on a TV unit: set the height to the unit's top (0.5 m for the TV unit, 0.65 m for the floating media unit)" },
  { id: "bookcase", name: "Bookcase", category: "Living", w: 0.80, d: 0.30, h: 1.8, color: WOOD, symbol: "shelves" },
  { id: "fireplace", name: "Fireplace (gas fire)", category: "Living", w: 1.40, d: 0.50, h: 1.15, color: "#5a2a1c", symbol: "fireplace", note: "Carved timber surround, marble hearth and back panel, brass gas fire" },
  { id: "sideboard", name: "Sideboard", category: "Living", w: 1.60, d: 0.45, h: 0.8, color: WOOD, symbol: "cabinet" },
  // Modern lounge: low, deep seating on slim legs, round tables, a floating media unit and rugs
  { id: "sofa-low-3", name: "Modern sofa (3 seat)", category: "Living", w: 2.30, d: 1.00, h: 0.75, color: "#bdb5a6", symbol: "low-sofa", note: "Low and deep, slim track arms, on black metal legs" },
  { id: "sofa-low-2", name: "Modern sofa (2 seat)", category: "Living", w: 1.80, d: 1.00, h: 0.75, color: "#bdb5a6", symbol: "low-sofa", note: "Low and deep, slim track arms, on black metal legs" },
  { id: "sofa-chaise", name: "Chaise sofa", category: "Living", w: 2.70, d: 1.65, h: 0.75, color: "#7d8a7a", symbol: "chaise-sofa", note: "Modern low sofa with a chaise end on the right" },
  { id: "lounge-chair", name: "Lounge chair (mid-century)", category: "Living", w: 0.85, d: 0.85, h: 0.85, color: "#3a3634", symbol: "lounge-chair", note: "Reclined leather seat in a walnut shell, on a swivel base" },
  { id: "armchair-wood", name: "Armchair (wooden frame)", category: "Living", w: 0.72, d: 0.82, h: 0.8, color: "#c9b79c", symbol: "wood-armchair", note: "Oak frame with slatted arms and loose seat and back cushions; the colour is the cushions" },
  { id: "beanbag-large", name: "Bean bag (large)", category: "Living", w: 0.95, d: 0.95, h: 0.55, color: "#7d8a7a", symbol: "beanbag", note: "A big round bag that slumps into a seat" },
  { id: "beanbag-small", name: "Bean bag (small)", category: "Living", w: 0.65, d: 0.65, h: 0.4, color: "#c9b79c", symbol: "beanbag", note: "Child size" },
  { id: "beanbag-chair", name: "Bean bag chair", category: "Living", w: 0.8, d: 0.9, h: 0.85, color: "#5b6b7f", symbol: "beanbag-chair", note: "A bag with a built-up back, like a low armchair" },
  { id: "pouf", name: "Pouffe (round)", category: "Living", w: 0.55, d: 0.55, h: 0.42, color: "#c9b79c", symbol: "pouf" },
  { id: "coffee-table-round", name: "Coffee table (round)", category: "Living", w: 0.90, d: 0.90, h: 0.38, color: "#d9cfc0", symbol: "round-table", note: "Stone top on a drum pedestal" },
  { id: "side-table-round", name: "Side table (round)", category: "Living", w: 0.45, d: 0.45, h: 0.55, color: "#2b2b2b", symbol: "round-table" },
  { id: "media-unit", name: "Media unit (floating)", category: "Living", w: 1.80, d: 0.40, h: 0.40, color: WALNUT, symbol: "media-unit", mount: 0.25, note: "Wall-hung, fluted handleless fronts" },
  { id: "table-lamp", name: "Table lamp (drum shade)", category: "Living", w: 0.35, d: 0.35, h: 0.55, color: "#f1ece2", symbol: "table-lamp", mount: 0.55, note: "Sits on a side table or sideboard: set the height above the floor to the top of whatever it stands on (0.55 m side table, 0.8 m sideboard)" },
  { id: "floor-lamp", name: "Floor lamp", category: "Living", w: 0.40, d: 0.40, h: 1.60, color: "#f1ece2", symbol: "floor-lamp", note: "Linen drum shade on a slim black stem" },
  { id: "rug-large", name: "Rug (200 × 300)", category: "Living", w: 3.00, d: 2.00, h: 0.01, color: "#d8cdb9", symbol: "rug", note: "Furniture can stand on it" },
  { id: "rug-medium", name: "Rug (160 × 230)", category: "Living", w: 2.30, d: 1.60, h: 0.01, color: "#d8cdb9", symbol: "rug", note: "Furniture can stand on it" },

  // Joinery: fitted, made to measure. Placing a built-in in an alcove sizes it to the recess and a window seat
  // by a window to the window (lib/recess.ts); settings in lib/joinery.ts.
  { id: "built-in-alcove", name: "Built-in alcove unit", category: "Joinery", w: 0.9, d: 0.4, h: 2.4, color: PAINTED, symbol: "built-in", toCeiling: true, joinery: { baseH: 0.85, baseFront: "shaker", top: true, plinth: true, shelves: 3, upperFront: "open", upperD: 0.3 }, note: "Cupboards below, open shelves above, floor to ceiling; click in an alcove to fit it" },
  { id: "built-in-cupboard", name: "Built-in cupboard (full height)", category: "Joinery", w: 0.9, d: 0.5, h: 2.4, color: PAINTED, symbol: "built-in", toCeiling: true, joinery: { baseH: 0.9, baseFront: "shaker", top: false, plinth: true, shelves: 3, upperFront: "shaker", topBox: 0.4 }, note: "Doors top to bottom with a top box; click in an alcove to fit it" },
  { id: "built-in-shelves", name: "Built-in shelves (open)", category: "Joinery", w: 0.9, d: 0.3, h: 2.4, color: PAINTED, symbol: "built-in", toCeiling: true, joinery: { baseH: 0, plinth: true, shelves: 5, upperFront: "open" }, note: "Open shelving floor to ceiling; click in an alcove to fit it" },
  { id: "window-seat", name: "Window seat", category: "Joinery", w: 1.2, d: 0.5, h: 0.45, color: PAINTED, symbol: "window-seat", joinery: { seatFront: "lid", plinth: true, backCushion: false }, note: "Storage bench with a cushion; click by a window to fit it to the window" },
  { id: "banquette", name: "Banquette", category: "Joinery", w: 1.6, d: 0.55, h: 0.45, color: PAINTED, symbol: "window-seat", joinery: { seatFront: "drawers", plinth: true, backCushion: true }, note: "Bench seat with drawers and back cushions, along a wall or under a window" },
  { id: "floating-shelves", name: "Floating shelves (stack of 3)", category: "Joinery", w: 1.0, d: 0.25, h: 0.74, color: WOOD, symbol: "shelf", mount: 1.2, joinery: { shelves: 3, shelfT: 0.04 }, note: "Set how many shelves, their spacing and thickness" },
  { id: "wall-cube", name: "Wall cube (open)", category: "Joinery", w: 0.4, d: 0.3, h: 0.4, color: PAINTED, symbol: "wall-box", mount: 1.4, joinery: { front: "open", bays: 1, shelves: 0 }, note: "Open box on the wall; set bays and shelves for a grid" },
  { id: "wall-cupboard", name: "Wall cupboard", category: "Joinery", w: 0.8, d: 0.3, h: 0.5, color: PAINTED, symbol: "wall-box", mount: 1.5, joinery: { front: "slab", shelves: 1 }, note: "Wall-hung cupboard for a living room or study" },

  // Dining
  { id: "table-4", name: "Dining table (4)", category: "Dining", w: 1.20, d: 0.80, h: 0.75, color: WOOD, symbol: "table" },
  { id: "table-6", name: "Dining table (6)", category: "Dining", w: 1.80, d: 0.90, h: 0.75, color: WOOD, symbol: "table" },
  { id: "chair", name: "Dining chair", category: "Dining", w: 0.45, d: 0.45, h: 0.9, color: WOOD, symbol: "chair" },
  { id: "bar-stool", name: "Bar stool (counter height)", category: "Dining", w: 0.38, d: 0.38, h: 0.65, color: "#3a3634", symbol: "stool", note: "Round seat on a slim stem with a footrest, 650 seat for a 900 worktop; tuck under an island or peninsula overhang" },
  { id: "bar-stool-back", name: "Bar stool with back", category: "Dining", w: 0.42, d: 0.45, h: 0.95, color: "#3a3634", symbol: "stool-back", note: "Counter-height seat (650) with a low back, on four legs with a footrest" },

  // Kitchen (600 mm module; base units include the worktop, wall units hang from 1.45 m)
  { id: "base-unit-300", name: "Base unit (300)", category: "Kitchen", w: 0.30, d: 0.60, h: 0.9, color: UNIT, symbol: "cabinet", note: "Half-width filler with one door; a pull-out larder or tray space" },
  { id: "base-unit", name: "Base unit (600)", category: "Kitchen", w: 0.60, d: 0.60, h: 0.9, color: UNIT, symbol: "cabinet" },
  { id: "base-unit-1000", name: "Base unit (1000)", category: "Kitchen", w: 1.00, d: 0.60, h: 0.9, color: UNIT, symbol: "cabinet" },
  { id: "sink-unit", name: "Sink base unit", category: "Kitchen", w: 1.00, d: 0.60, h: 0.9, color: UNIT, symbol: "sink", note: "Bowl and drainer on a 1000 unit" },
  { id: "worktop-run", name: "Worktop run (3 m)", category: "Kitchen", w: 3.00, d: 0.60, h: 0.9, color: UNIT, symbol: "worktop", note: "Base units under a worktop; set any length" },
  { id: "hob", name: "Hob", category: "Kitchen", w: 0.60, d: 0.52, h: 0.03, color: "#2b2d31", symbol: "hob", mount: 0.9, note: "Sits on a worktop or base unit" },
  { id: "wall-unit-300", name: "Wall cabinet (300)", category: "Kitchen", w: 0.30, d: 0.33, h: 0.72, color: UNIT, symbol: "wall-cabinet", mount: 1.45 },
  { id: "wall-unit", name: "Wall cabinet (600)", category: "Kitchen", w: 0.60, d: 0.33, h: 0.72, color: UNIT, symbol: "wall-cabinet", mount: 1.45 },
  { id: "wall-unit-1000", name: "Wall cabinet (1000)", category: "Kitchen", w: 1.00, d: 0.33, h: 0.72, color: UNIT, symbol: "wall-cabinet", mount: 1.45 },
  { id: "cooker-hood", name: "Cooker hood (under a short cabinet)", category: "Kitchen", w: 0.60, d: 0.45, h: 0.72, color: UNIT, symbol: "hood", mount: 1.45, note: "Canopy hood with a short wall cabinet above, in line with the wall cabinets" },
  { id: "oven-housing", name: "Oven housing (tall)", category: "Kitchen", w: 0.60, d: 0.60, h: 2.1, color: UNIT, symbol: "oven", note: "Built-in single or double oven" },
  { id: "larder", name: "Tall larder unit", category: "Kitchen", w: 0.60, d: 0.60, h: 2.1, color: UNIT, symbol: "tall" },
  { id: "range-cooker", name: "Range cooker", category: "Kitchen", w: 1.00, d: 0.60, h: 0.92, color: "#2f3a45", symbol: "range" },
  { id: "island-1200", name: "Island (1.2 × 0.9)", category: "Kitchen", w: 1.20, d: 0.90, h: 0.9, color: UNIT, symbol: "island" },
  { id: "island-1800", name: "Island (1.8 × 0.9)", category: "Kitchen", w: 1.80, d: 0.90, h: 0.9, color: UNIT, symbol: "island" },
  { id: "corner-unit", name: "Corner base unit, L (900)", category: "Kitchen", w: 0.90, d: 0.90, h: 0.9, color: UNIT, symbol: "corner-unit", note: "Two 600 arms meeting in the corner under an L-shaped worktop; turn it to suit the corner" },
  { id: "corner-diagonal", name: "Corner base unit, diagonal (900)", category: "Kitchen", w: 0.90, d: 0.90, h: 0.9, color: UNIT, symbol: "corner-diagonal", note: "One angled door across the corner between the two runs" },
  { id: "peninsula", name: "Peninsula (1.8 × 0.9)", category: "Kitchen", w: 1.80, d: 0.90, h: 0.9, color: UNIT, symbol: "peninsula", note: "Turn it end-on to a wall or corner unit; doors at the front, a stool overhang at the back when deeper than 0.75 m, end panels both ends" },
  { id: "fridge-freezer", name: "Fridge freezer", category: "Kitchen", w: 0.60, d: 0.65, h: 1.85, color: "#e8e8e8", symbol: "appliance" },
  { id: "cooker", name: "Cooker", category: "Kitchen", w: 0.60, d: 0.60, h: 0.9, color: "#e8e8e8", symbol: "range", note: "Free-standing, oven under a hob" },
  { id: "dishwasher", name: "Dishwasher", category: "Kitchen", w: 0.60, d: 0.60, h: 0.85, color: "#e8e8e8", symbol: "appliance" },
  // Modern kitchen: handleless runs, drawers, appliance stacks and a side-by-side fridge
  { id: "american-fridge", name: "American fridge freezer", category: "Kitchen", w: 0.91, d: 0.72, h: 1.78, color: STAINLESS, symbol: "american-fridge", note: "Side-by-side doors with a water and ice dispenser; allow about 50 mm each side and behind" },
  { id: "handleless-unit-300", name: "Handleless base unit (300)", category: "Kitchen", w: 0.30, d: 0.60, h: 0.9, color: UNIT, symbol: "handleless", note: "Half-width filler with one slab door" },
  { id: "handleless-unit", name: "Handleless base unit (600)", category: "Kitchen", w: 0.60, d: 0.60, h: 0.9, color: UNIT, symbol: "handleless", note: "Slab doors with a J-pull rail under the worktop" },
  { id: "handleless-unit-1000", name: "Handleless base unit (1000)", category: "Kitchen", w: 1.00, d: 0.60, h: 0.9, color: UNIT, symbol: "handleless", note: "Slab doors with a J-pull rail under the worktop" },
  { id: "handleless-run", name: "Handleless run (3 m)", category: "Kitchen", w: 3.00, d: 0.60, h: 0.9, color: UNIT, symbol: "handleless", note: "Handleless units under a worktop; set any length" },
  { id: "pan-drawers", name: "Pan drawer unit (800)", category: "Kitchen", w: 0.80, d: 0.60, h: 0.9, color: UNIT, symbol: "drawers", note: "Three deep drawers; good under a hob" },
  { id: "wine-cooler", name: "Wine cooler (600, under counter)", category: "Kitchen", w: 0.60, d: 0.60, h: 0.9, color: UNIT, symbol: "wine-cooler", note: "Glass-door cooler in a base unit, under the worktop" },
  { id: "induction-hob", name: "Induction hob (800)", category: "Kitchen", w: 0.80, d: 0.52, h: 0.01, color: "#141518", symbol: "hob", mount: 0.9, note: "Flush black glass; sits on a worktop or pan drawers" },
  { id: "gas-hob-900", name: "Gas hob, 6 burner (900)", category: "Kitchen", w: 0.90, d: 0.52, h: 0.04, color: "#2b2d31", symbol: "gas-hob", mount: 0.9, note: "Six burners in two rows on cast-iron pan supports; sits on a worktop or base unit" },
  { id: "induction-hob-900", name: "Induction hob, 6 zone (900)", category: "Kitchen", w: 0.90, d: 0.52, h: 0.01, color: "#141518", symbol: "induction", mount: 0.9, note: "Flush black glass with six zones; sits on a worktop or pan drawers" },
  { id: "vented-hob", name: "Vented induction hob (800)", category: "Kitchen", w: 0.80, d: 0.52, h: 0.01, color: "#141518", symbol: "vented-hob", mount: 0.9, note: "Four zones around a central downdraught extractor, so no hood is needed" },
  { id: "glass-hood", name: "Angled glass hood (900)", category: "Kitchen", w: 0.90, d: 0.40, h: 1.0, color: "#141518", symbol: "glass-hood", mount: 1.5, note: "Inclined black glass on the wall at head height with a slim chimney; set the height to reach the ceiling" },
  { id: "box-hood-600", name: "Slimline box hood (600)", category: "Kitchen", w: 0.60, d: 0.50, h: 0.12, color: STAINLESS, symbol: "box-hood", mount: 1.5, note: "Flat canopy on the wall, on its own or under a wall cabinet" },
  { id: "box-hood-900", name: "Slimline box hood (900)", category: "Kitchen", w: 0.90, d: 0.50, h: 0.12, color: STAINLESS, symbol: "box-hood", mount: 1.5, note: "Flat canopy on the wall, on its own or under a wall cabinet" },
  { id: "island-hood", name: "Island hood (900)", category: "Kitchen", w: 0.90, d: 0.50, h: 0.75, color: STAINLESS, symbol: "island-hood", mount: 1.5, note: "Box canopy hung from the ceiling over an island or peninsula; set the height to reach the ceiling" },
  { id: "chimney-hood", name: "Chimney extractor (900)", category: "Kitchen", w: 0.90, d: 0.50, h: 1.0, color: STAINLESS, symbol: "chimney-hood", mount: 1.55, note: "Wall-mounted canopy and chimney; set the height to reach the ceiling" },
  { id: "oven-pair", name: "Oven tower (oven and combi microwave)", category: "Kitchen", w: 0.60, d: 0.60, h: 2.2, color: UNIT, symbol: "oven-pair", note: "Single oven with a compact combi microwave above, at eye level" },
  { id: "fridge-integrated", name: "Integrated fridge freezer (tall)", category: "Kitchen", w: 0.60, d: 0.60, h: 2.2, color: UNIT, symbol: "tall", note: "Built in behind two cabinet doors" },
  { id: "island-waterfall", name: "Island, waterfall (2.4 × 1.0)", category: "Kitchen", w: 2.40, d: 1.00, h: 0.92, color: UNIT, symbol: "waterfall", note: "Worktop runs down both ends; overhang at the back for stools" },
  { id: "island-2400", name: "Island (2.4 × 1.0)", category: "Kitchen", w: 2.40, d: 1.00, h: 0.9, color: UNIT, symbol: "island" },
  { id: "corner-unit-handleless", name: "Handleless corner unit, L (900)", category: "Kitchen", w: 0.90, d: 0.90, h: 0.9, color: UNIT, symbol: "corner-unit-handleless", note: "Two 600 arms meeting in the corner under an L-shaped worktop; turn it to suit the corner" },
  { id: "corner-diagonal-handleless", name: "Handleless corner unit, diagonal (900)", category: "Kitchen", w: 0.90, d: 0.90, h: 0.9, color: UNIT, symbol: "corner-diagonal-handleless", note: "One angled slab door across the corner between the two runs" },
  { id: "peninsula-handleless", name: "Handleless peninsula (1.8 × 0.9)", category: "Kitchen", w: 1.80, d: 0.90, h: 0.9, color: UNIT, symbol: "peninsula-handleless", note: "Turn it end-on to a wall or corner unit; slab doors at the front, a stool overhang at the back when deeper than 0.75 m, end panels both ends" },
  { id: "floating-shelf", name: "Floating shelf (1 m)", category: "Kitchen", w: 1.00, d: 0.25, h: 0.04, color: WOOD, symbol: "shelf", mount: 1.5, note: "Open shelf in place of wall cabinets; set any width, or a stack in the inspector" },

  // Utility
  { id: "washing-machine", name: "Washing machine", category: "Utility", w: 0.60, d: 0.60, h: 0.85, color: "#e8e8e8", symbol: "washer" },
  { id: "tumble-dryer", name: "Tumble dryer", category: "Utility", w: 0.60, d: 0.60, h: 0.85, color: "#e8e8e8", symbol: "washer" },
  { id: "boiler", name: "Boiler (combi)", category: "Utility", w: 0.40, d: 0.30, h: 0.70, color: "#f2f2f2", symbol: "boiler", mount: 1.2, note: "Wall-hung" },

  // Heating: UK steel panel radiators, wall-hung about 0.15 m off the floor. Depth sets the type
  // (see radiatorPanels): about 0.07 m is a single panel with fins behind (type 11), 0.10 m a double (type 21 or 22).
  { id: "radiator-single-600", name: "Radiator, single (600 × 600)", category: "Heating", w: 0.60, d: 0.07, h: 0.60, color: "#f4f4f1", symbol: "radiator", mount: 0.15, note: "Type 11 panel; set any width and height" },
  { id: "radiator-single-1000", name: "Radiator, single (1000 × 450)", category: "Heating", w: 1.00, d: 0.07, h: 0.45, color: "#f4f4f1", symbol: "radiator", mount: 0.15, note: "Type 11 panel, under a window" },
  { id: "radiator-double-1000", name: "Radiator, double (1000 × 600)", category: "Heating", w: 1.00, d: 0.10, h: 0.60, color: "#f4f4f1", symbol: "radiator", mount: 0.15, note: "Type 22: two panels with fins between" },
  { id: "radiator-double-1200", name: "Radiator, double (1200 × 450)", category: "Heating", w: 1.20, d: 0.10, h: 0.45, color: "#f4f4f1", symbol: "radiator", mount: 0.15, note: "Type 22, low under a window" },
  { id: "radiator-double-1600", name: "Radiator, double (1600 × 700)", category: "Heating", w: 1.60, d: 0.10, h: 0.70, color: "#f4f4f1", symbol: "radiator", mount: 0.15, note: "Type 22, for a large room" },
  { id: "radiator-column", name: "Column radiator (800 × 600)", category: "Heating", w: 0.80, d: 0.10, h: 0.60, color: "#f4f4f1", symbol: "column-radiator", mount: 0.12, note: "Traditional steel columns; set any width" },
  { id: "radiator-vertical", name: "Vertical radiator (450 × 1800)", category: "Heating", w: 0.45, d: 0.10, h: 1.80, color: "#3a3d42", symbol: "column-radiator", mount: 0.1, note: "Tall columns for a narrow wall" },

  // Other
  { id: "desk", name: "Desk", category: "Other", w: 1.20, d: 0.60, h: 0.75, color: WOOD, symbol: "table" },
  { id: "desk-lamp", name: "Desk lamp (angled)", category: "Other", w: 0.18, d: 0.3, h: 0.45, color: "#2b2d31", symbol: "desk-lamp", mount: 0.75, note: "A task lamp on a jointed arm; set the height above the floor to the desk top" },
  { id: "car", name: "Car (family hatchback)", category: "Other", w: 1.80, d: 4.40, h: 1.5, color: "#8c96a3", symbol: "car", note: "Typical UK family car" },
  { id: "custom", name: "Custom box", category: "Other", w: 1.00, d: 1.00, h: 1.0, color: "#b8c4a8", symbol: "box", note: "Set its size and label in the inspector" },
];

/**
 * Proportions of a chaise sofa `w` by `d` metres, shared by the plan and 3D view:
 * seat depth `s` of the run along the back, width `c` of the chaise on the right
 * (which runs the full depth), and back and arm thicknesses.
 */
export function chaiseSizes(w: number, d: number, seat?: number): { s: number; c: number; back: number; arm: number } {
  const s = seatDepth(seat, Math.min(1.0, d * 0.62), w, d);
  return { s, c: Math.min(0.95, w * 0.38), back: Math.min(0.2, s * 0.25), arm: Math.min(0.14, w * 0.06) };
}

/** Shallowest seat an L-shaped sofa can have, metres. */
export const MIN_SEAT = 0.5;

/** A chosen seat depth, kept sensible: at least MIN_SEAT and leaving 0.3 m of the sofa beyond it; the default when none is set. */
function seatDepth(seat: number | undefined, fallback: number, w: number, d: number): number {
  const max = Math.max(MIN_SEAT, Math.min(w, d) - 0.3);
  return seat === undefined || !Number.isFinite(seat) ? Math.min(fallback, max) : Math.min(max, Math.max(MIN_SEAT, seat));
}

/**
 * Parts of a corner sofa of footprint w × d metres: the depth `s` of both runs
 * (the seat depth, set on the fixture or taken from the size), the back
 * thickness and the arm width. The plan symbol and the 3D model share it.
 */
export function cornerSofaSizes(w: number, d: number, seat?: number): { s: number; back: number; arm: number } {
  const s = seatDepth(seat, Math.min(0.95, w * 0.45, d * 0.5), w, d);
  return { s, back: Math.min(0.22, s * 0.3), arm: Math.min(0.2, s * 0.25) };
}

/** Whether an item's seat depth can be set (L-shaped sofas). */
export function hasSeatDepth(item: Pick<CatalogueItem, "symbol">): boolean {
  return item.symbol === "corner-sofa" || item.symbol === "chaise-sofa";
}

/**
 * Burner positions on a cooker or range top as fractions of its width and
 * depth from the centre: four on a 600 mm cooker, five on a range.
 */
/** Pitch of the cubes in cube shelving, metres (a 385 mm cube plus a board). */
export const CUBE = 0.385;
/** Board thickness of cube shelving, metres. */
export const CUBE_BOARD = 0.035;

/** How many cubes across and up a cube-shelving unit of w × h metres has: one per 0.385 m, at least one each way. */
export function cubeGrid(w: number, h: number): { cols: number; rows: number } {
  return { cols: Math.max(1, Math.round(w / CUBE)), rows: Math.max(1, Math.round(h / CUBE)) };
}

/**
 * Square ends of a corner unit of footprint w × d metres, kept inside the legs: how far the front's start on the
 * back leg (endBack, along the side at x = w) and on the side leg (endSide, along the face at y = d) is from the walls.
 */
export function cornerEnds(w: number, d: number, fx: { endBack?: number; endSide?: number }): { endBack: number; endSide: number } {
  const clampTo = (v: number | undefined, max: number) => (v !== undefined && Number.isFinite(v) ? Math.min(Math.max(0, v), Math.max(0, max)) : 0);
  return { endBack: clampTo(fx.endBack, d - 0.1), endSide: clampTo(fx.endSide, w - 0.1) };
}

/** Whether an item is a corner unit with a flat-or-curved front. */
export function isCornerUnit(item: Pick<CatalogueItem, "symbol">): boolean {
  return item.symbol === "corner-tv";
}

/** Screen sizes offered for a TV, inches across the diagonal. */
export const TV_SIZES: readonly number[] = [32, 40, 43, 50, 55, 65, 75, 85];
/** Height of the pedestal under a TV on a stand, metres (part of the item's height). */
export const TV_STAND_H = 0.1;
const INCH = 0.0254;
/** A 16:9 screen's width and height from its diagonal in inches. */
const SCREEN_W = Math.cos(Math.atan(9 / 16));
const SCREEN_H = Math.sin(Math.atan(9 / 16));

/** Whether an item is a TV, whose size is picked by screen diagonal. */
export function isTv(item: Pick<CatalogueItem, "symbol">): boolean {
  return item.symbol === "tv-wall" || item.symbol === "tv-stand";
}

/** The footprint size of a TV of `inches` across the diagonal: the screen, plus the pedestal on a stand. */
export function tvSize(item: Pick<CatalogueItem, "symbol" | "d">, inches: number): { w: number; d: number; h: number } {
  const w = inches * INCH * SCREEN_W;
  const h = inches * INCH * SCREEN_H + (item.symbol === "tv-stand" ? TV_STAND_H : 0);
  return { w: Math.round(w * 100) / 100, d: item.symbol === "tv-stand" ? Math.round(Math.max(0.22, w * 0.2) * 100) / 100 : item.d, h: Math.round(h * 100) / 100 };
}

/** The screen size in inches that a TV of width `w` metres is, or undefined when it is no standard size. */
export function tvInches(w: number): number | undefined {
  return TV_SIZES.find((n) => Math.abs(n * INCH * SCREEN_W - w) < 0.02);
}

/** Burner or zone centres of a six-ring hob as fractions of its width and depth from the centre: three across, two rows. */
export const SIX_RINGS: readonly [number, number][] = [
  [-0.3, -0.22],
  [0, -0.22],
  [0.3, -0.22],
  [-0.3, 0.2],
  [0, 0.2],
  [0.3, 0.2],
];

/** Zone centres of a vented hob: four zones in two pairs either side of the central extractor slot. */
export const VENTED_ZONES: readonly [number, number][] = [
  [-0.3, -0.22],
  [0.3, -0.22],
  [-0.3, 0.22],
  [0.3, 0.22],
];

export function burners(widthM: number): [number, number][] {
  return widthM < 0.8
    ? [
        [-0.25, -0.22],
        [0.25, -0.22],
        [-0.25, 0.2],
        [0.25, 0.2],
      ]
    : [
        [-0.32, -0.22],
        [0, -0.22],
        [0.32, -0.22],
        [-0.2, 0.18],
        [0.2, 0.18],
      ];
}

/**
 * Panels of a panel radiator from its depth: a single panel (type 11) up to
 * about 85 mm deep, a double (types 21 and 22) beyond; the plan and 3D view
 * draw it this way, so changing the depth changes the type.
 */
export function radiatorPanels(d: number): 1 | 2 {
  return d > 0.085 ? 2 : 1;
}

const WORKTOP_SYMBOLS: Symbol[] = [
  "worktop",
  "sink",
  "island",
  "cabinet",
  "handleless",
  "drawers",
  "wine-cooler",
  "waterfall",
  "corner-unit",
  "corner-unit-handleless",
  "corner-diagonal",
  "corner-diagonal-handleless",
  "peninsula",
  "peninsula-handleless",
];

/** Whether a kitchen symbol has handleless slab fronts rather than framed doors. */
export function isHandleless(symbol: Symbol): boolean {
  return symbol === "handleless" || symbol === "waterfall" || symbol.endsWith("-handleless");
}

/**
 * Depth of the two arms of a corner unit (L or diagonal) with footprint w × d metres: 600 mm like the runs
 * either side, shallower on a small unit so the corner keeps a notch (L) or a face (diagonal) of at least 0.2 m.
 * The arms run along the back and down the left; the plan symbol and the 3D model both cut the corner this way.
 */
export function cornerArm(w: number, d: number): number {
  return Math.max(0.2, Math.min(0.6, Math.min(w, d) - 0.2));
}

/**
 * Breakfast-bar overhang at the back of a peninsula of depth d metres: none on a 600 run, up to 300 mm once the
 * depth passes 0.75 m so the units in front stay at least 600 deep.
 */
export function peninsulaOverhang(d: number): number {
  return d > 0.75 ? Math.min(0.3, d - 0.6) : 0;
}

/** Whether an item is drawn with a worktop on top (kitchen base units, sinks, runs, islands), whose colour can be set. */
export function hasWorktop(item: CatalogueItem): boolean {
  return item.category === "Kitchen" && WORKTOP_SYMBOLS.includes(item.symbol);
}

/**
 * Doors across the front of an American fridge freezer of width `w` metres: the freezer on the left,
 * narrower than the fridge, as on side-by-side models. Returns the x of the split from the centre.
 */
export function sideBySideSplit(w: number): number {
  return -w * 0.08;
}

/** Whether an item lies flat on the floor under other furniture (rugs): drawn first on the plan and left out of clash checks. */
export function isFloorCovering(item: Pick<CatalogueItem, "symbol">): boolean {
  return item.symbol === "rug";
}

/** Height of a fixture's base above the floor: its own override, else the catalogue's, else 0 (on the floor). */
export function mountOf(fx: { mount?: number }, item: Pick<CatalogueItem, "mount">): number {
  const m = fx.mount ?? item.mount ?? 0;
  return Number.isFinite(m) ? Math.max(0, m) : item.mount ?? 0;
}

/** Category of the owner's own pieces. */
export const MINE = "Mine";
export const CATEGORIES = [...new Set(CATALOGUE.map((c) => c.category))];
export const byId = (id: string) => CATALOGUE.find((c) => c.id === id);

/** Catalogue items matching a search and category. Case-insensitive; every word of the query must appear in the name, category or note. */
export function filterCatalogue(query: string, category: string | "All", extra: CatalogueItem[] = []): CatalogueItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return [...extra, ...CATALOGUE].filter((c) => {
    if (category !== "All" && c.category !== category) return false;
    const hay = `${c.name} ${c.category} ${c.note ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
