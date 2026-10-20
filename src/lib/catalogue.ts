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
  | "hood"
  | "fireplace";

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
  note?: string;
}

/** Kitchen carcass colour shared by the units so a run reads as one kitchen. */
const UNIT = "#e0dccf";
const WOOD = "#c9a26b";
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
  { id: "wardrobe-double", name: "Double wardrobe", category: "Bedroom", w: 1.00, d: 0.60, h: 2.0, color: WOOD, symbol: "box" },
  { id: "wardrobe-triple", name: "Triple wardrobe", category: "Bedroom", w: 1.50, d: 0.60, h: 2.0, color: WOOD, symbol: "box" },
  { id: "wardrobe-fitted", name: "Fitted wardrobe", category: "Bedroom", w: 1.80, d: 0.60, h: 2.4, color: "#f5f5f5", symbol: "fitted-wardrobe", note: "Floor to ceiling, with top boxes; set any width" },
  { id: "wardrobe-shaker", name: "Fitted wardrobe (shaker)", category: "Bedroom", w: 1.80, d: 0.60, h: 2.4, color: "#cfd2d6", symbol: "shaker-wardrobe", note: "Floor to ceiling, framed doors with knobs; set any width" },
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
  { id: "towel-rail", name: "Heated towel rail", category: "Bathroom", w: 0.50, d: 0.10, h: 1.2, color: "#c8ccd1", symbol: "towel-rail", mount: 0.15, note: "Wall-hung" },

  // Living
  { id: "sofa-3", name: "Sofa (3 seat)", category: "Living", w: 2.00, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "sofa-2", name: "Sofa (2 seat)", category: "Living", w: 1.60, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "sofa-corner", name: "Corner sofa", category: "Living", w: 2.50, d: 1.90, h: 0.85, color: "#9ab0c8", symbol: "corner-sofa", note: "L-shaped; the short arm is on the left" },
  { id: "armchair", name: "Armchair", category: "Living", w: 0.90, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "coffee-table", name: "Coffee table", category: "Living", w: 1.00, d: 0.50, h: 0.45, color: WOOD, symbol: "table" },
  { id: "tv-unit", name: "TV unit", category: "Living", w: 1.20, d: 0.40, h: 0.5, color: WOOD, symbol: "box" },
  { id: "bookcase", name: "Bookcase", category: "Living", w: 0.80, d: 0.30, h: 1.8, color: WOOD, symbol: "shelves" },
  { id: "fireplace", name: "Fireplace (gas fire)", category: "Living", w: 1.40, d: 0.50, h: 1.15, color: "#5a2a1c", symbol: "fireplace", note: "Carved timber surround, marble hearth and back panel, brass gas fire" },
  { id: "sideboard", name: "Sideboard", category: "Living", w: 1.60, d: 0.45, h: 0.8, color: WOOD, symbol: "cabinet" },

  // Dining
  { id: "table-4", name: "Dining table (4)", category: "Dining", w: 1.20, d: 0.80, h: 0.75, color: WOOD, symbol: "table" },
  { id: "table-6", name: "Dining table (6)", category: "Dining", w: 1.80, d: 0.90, h: 0.75, color: WOOD, symbol: "table" },
  { id: "chair", name: "Dining chair", category: "Dining", w: 0.45, d: 0.45, h: 0.9, color: WOOD, symbol: "chair" },

  // Kitchen (600 mm module; base units include the worktop, wall units hang from 1.45 m)
  { id: "base-unit", name: "Base unit (600)", category: "Kitchen", w: 0.60, d: 0.60, h: 0.9, color: UNIT, symbol: "cabinet" },
  { id: "base-unit-1000", name: "Base unit (1000)", category: "Kitchen", w: 1.00, d: 0.60, h: 0.9, color: UNIT, symbol: "cabinet" },
  { id: "sink-unit", name: "Sink base unit", category: "Kitchen", w: 1.00, d: 0.60, h: 0.9, color: UNIT, symbol: "sink", note: "Bowl and drainer on a 1000 unit" },
  { id: "worktop-run", name: "Worktop run (3 m)", category: "Kitchen", w: 3.00, d: 0.60, h: 0.9, color: UNIT, symbol: "worktop", note: "Base units under a worktop; set any length" },
  { id: "hob", name: "Hob", category: "Kitchen", w: 0.60, d: 0.52, h: 0.03, color: "#2b2d31", symbol: "hob", mount: 0.9, note: "Sits on a worktop or base unit" },
  { id: "wall-unit", name: "Wall cabinet (600)", category: "Kitchen", w: 0.60, d: 0.33, h: 0.72, color: UNIT, symbol: "wall-cabinet", mount: 1.45 },
  { id: "wall-unit-1000", name: "Wall cabinet (1000)", category: "Kitchen", w: 1.00, d: 0.33, h: 0.72, color: UNIT, symbol: "wall-cabinet", mount: 1.45 },
  { id: "cooker-hood", name: "Cooker hood (under a short cabinet)", category: "Kitchen", w: 0.60, d: 0.45, h: 0.72, color: UNIT, symbol: "hood", mount: 1.45, note: "Canopy hood with a short wall cabinet above, in line with the wall cabinets" },
  { id: "oven-housing", name: "Oven housing (tall)", category: "Kitchen", w: 0.60, d: 0.60, h: 2.1, color: UNIT, symbol: "oven", note: "Built-in single or double oven" },
  { id: "larder", name: "Tall larder unit", category: "Kitchen", w: 0.60, d: 0.60, h: 2.1, color: UNIT, symbol: "tall" },
  { id: "range-cooker", name: "Range cooker", category: "Kitchen", w: 1.00, d: 0.60, h: 0.92, color: "#2f3a45", symbol: "range" },
  { id: "island-1200", name: "Island (1.2 × 0.9)", category: "Kitchen", w: 1.20, d: 0.90, h: 0.9, color: UNIT, symbol: "island" },
  { id: "island-1800", name: "Island (1.8 × 0.9)", category: "Kitchen", w: 1.80, d: 0.90, h: 0.9, color: UNIT, symbol: "island" },
  { id: "fridge-freezer", name: "Fridge freezer", category: "Kitchen", w: 0.60, d: 0.65, h: 1.85, color: "#e8e8e8", symbol: "appliance" },
  { id: "cooker", name: "Cooker", category: "Kitchen", w: 0.60, d: 0.60, h: 0.9, color: "#e8e8e8", symbol: "range", note: "Free-standing, oven under a hob" },
  { id: "dishwasher", name: "Dishwasher", category: "Kitchen", w: 0.60, d: 0.60, h: 0.85, color: "#e8e8e8", symbol: "appliance" },

  // Utility
  { id: "washing-machine", name: "Washing machine", category: "Utility", w: 0.60, d: 0.60, h: 0.85, color: "#e8e8e8", symbol: "washer" },
  { id: "tumble-dryer", name: "Tumble dryer", category: "Utility", w: 0.60, d: 0.60, h: 0.85, color: "#e8e8e8", symbol: "washer" },
  { id: "boiler", name: "Boiler (combi)", category: "Utility", w: 0.40, d: 0.30, h: 0.70, color: "#f2f2f2", symbol: "boiler", mount: 1.2, note: "Wall-hung" },

  // Other
  { id: "desk", name: "Desk", category: "Other", w: 1.20, d: 0.60, h: 0.75, color: WOOD, symbol: "table" },
  { id: "car", name: "Car (family hatchback)", category: "Other", w: 1.80, d: 4.40, h: 1.5, color: "#8c96a3", symbol: "car", note: "Typical UK family car" },
  { id: "custom", name: "Custom box", category: "Other", w: 1.00, d: 1.00, h: 1.0, color: "#b8c4a8", symbol: "box", note: "Set its size and label in the inspector" },
];

/**
 * Burner positions on a cooker or range top as fractions of its width and
 * depth from the centre: four on a 600 mm cooker, five on a range.
 */
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

/** Whether an item is drawn with a worktop on top (kitchen base units, sinks, runs, islands), whose colour can be set. */
export function hasWorktop(item: CatalogueItem): boolean {
  return item.category === "Kitchen" && (item.symbol === "worktop" || item.symbol === "sink" || item.symbol === "island" || item.symbol === "cabinet");
}

export const CATEGORIES = [...new Set(CATALOGUE.map((c) => c.category))];
export const byId = (id: string) => CATALOGUE.find((c) => c.id === id);
