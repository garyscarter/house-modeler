/**
 * Furniture and fixture catalogue with typical UK sizes, in metres.
 * `w` is the width left-right on the plan at rotation 0, `d` the depth top-bottom,
 * `h` the height. Add entries here to extend the palette.
 */
export type Symbol = "bed" | "toilet" | "basin" | "shower" | "bath" | "box" | "round" | "car" | "sofa" | "table" | "chair" | "appliance";

export interface CatalogueItem {
  id: string;
  name: string;
  category: string;
  w: number;
  d: number;
  h: number;
  color: string;
  symbol: Symbol;
  note?: string;
}

export const CATALOGUE: CatalogueItem[] = [
  // Beds: UK mattress sizes plus ~5 cm of frame each way
  { id: "bed-single", name: "Single bed", category: "Bedroom", w: 0.95, d: 1.95, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 90 × 190 cm" },
  { id: "bed-small-double", name: "Small double bed", category: "Bedroom", w: 1.25, d: 1.95, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 120 × 190 cm" },
  { id: "bed-double", name: "Double bed", category: "Bedroom", w: 1.40, d: 1.95, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 135 × 190 cm" },
  { id: "bed-king", name: "King bed", category: "Bedroom", w: 1.55, d: 2.05, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 150 × 200 cm" },
  { id: "bed-super-king", name: "Super king bed", category: "Bedroom", w: 1.85, d: 2.05, h: 0.5, color: "#d9c7e8", symbol: "bed", note: "Mattress 180 × 200 cm" },
  { id: "bedside", name: "Bedside table", category: "Bedroom", w: 0.45, d: 0.40, h: 0.55, color: "#c9a26b", symbol: "box" },
  { id: "wardrobe-double", name: "Double wardrobe", category: "Bedroom", w: 1.00, d: 0.60, h: 2.0, color: "#c9a26b", symbol: "box" },
  { id: "wardrobe-triple", name: "Triple wardrobe", category: "Bedroom", w: 1.50, d: 0.60, h: 2.0, color: "#c9a26b", symbol: "box" },
  { id: "chest", name: "Chest of drawers", category: "Bedroom", w: 0.80, d: 0.45, h: 0.9, color: "#c9a26b", symbol: "box" },

  // Bathroom
  { id: "toilet", name: "Toilet", category: "Bathroom", w: 0.38, d: 0.68, h: 0.8, color: "#ffffff", symbol: "toilet", note: "Close-coupled WC" },
  { id: "basin", name: "Basin (standard)", category: "Bathroom", w: 0.55, d: 0.45, h: 0.85, color: "#ffffff", symbol: "basin" },
  { id: "basin-compact", name: "Basin (compact)", category: "Bathroom", w: 0.40, d: 0.30, h: 0.85, color: "#ffffff", symbol: "basin", note: "Cloakroom size" },
  { id: "shower", name: "Shower (standard)", category: "Bathroom", w: 0.80, d: 0.80, h: 2.0, color: "#cfe3ec", symbol: "shower" },
  { id: "shower-900", name: "Shower (900)", category: "Bathroom", w: 0.90, d: 0.90, h: 2.0, color: "#cfe3ec", symbol: "shower" },
  { id: "shower-walkin", name: "Shower (walk-in)", category: "Bathroom", w: 1.20, d: 0.90, h: 2.0, color: "#cfe3ec", symbol: "shower" },
  { id: "bath", name: "Bath (standard)", category: "Bathroom", w: 1.70, d: 0.70, h: 0.55, color: "#ffffff", symbol: "bath" },
  { id: "bath-small", name: "Bath (small)", category: "Bathroom", w: 1.50, d: 0.70, h: 0.55, color: "#ffffff", symbol: "bath" },

  // Living
  { id: "sofa-3", name: "Sofa (3 seat)", category: "Living", w: 2.00, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "sofa-2", name: "Sofa (2 seat)", category: "Living", w: 1.60, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "armchair", name: "Armchair", category: "Living", w: 0.90, d: 0.90, h: 0.85, color: "#9ab0c8", symbol: "sofa" },
  { id: "coffee-table", name: "Coffee table", category: "Living", w: 1.00, d: 0.50, h: 0.45, color: "#c9a26b", symbol: "table" },
  { id: "tv-unit", name: "TV unit", category: "Living", w: 1.20, d: 0.40, h: 0.5, color: "#c9a26b", symbol: "box" },

  // Dining
  { id: "table-4", name: "Dining table (4)", category: "Dining", w: 1.20, d: 0.80, h: 0.75, color: "#c9a26b", symbol: "table" },
  { id: "table-6", name: "Dining table (6)", category: "Dining", w: 1.80, d: 0.90, h: 0.75, color: "#c9a26b", symbol: "table" },
  { id: "chair", name: "Dining chair", category: "Dining", w: 0.45, d: 0.45, h: 0.9, color: "#c9a26b", symbol: "chair" },

  // Kitchen (600 mm module)
  { id: "base-unit", name: "Base unit (600)", category: "Kitchen", w: 0.60, d: 0.60, h: 0.9, color: "#e0dccf", symbol: "box" },
  { id: "base-unit-1000", name: "Base unit (1000)", category: "Kitchen", w: 1.00, d: 0.60, h: 0.9, color: "#e0dccf", symbol: "box" },
  { id: "fridge-freezer", name: "Fridge freezer", category: "Kitchen", w: 0.60, d: 0.65, h: 1.85, color: "#e8e8e8", symbol: "appliance" },
  { id: "cooker", name: "Cooker", category: "Kitchen", w: 0.60, d: 0.60, h: 0.9, color: "#e8e8e8", symbol: "appliance" },
  { id: "washing-machine", name: "Washing machine", category: "Kitchen", w: 0.60, d: 0.60, h: 0.85, color: "#e8e8e8", symbol: "appliance" },
  { id: "dishwasher", name: "Dishwasher", category: "Kitchen", w: 0.60, d: 0.60, h: 0.85, color: "#e8e8e8", symbol: "appliance" },

  // Other
  { id: "desk", name: "Desk", category: "Other", w: 1.20, d: 0.60, h: 0.75, color: "#c9a26b", symbol: "table" },
  { id: "car", name: "Car (family hatchback)", category: "Other", w: 1.80, d: 4.40, h: 1.5, color: "#8c96a3", symbol: "car", note: "Typical UK family car" },
];

export const CATEGORIES = [...new Set(CATALOGUE.map((c) => c.category))];
export const byId = (id: string) => CATALOGUE.find((c) => c.id === id);
