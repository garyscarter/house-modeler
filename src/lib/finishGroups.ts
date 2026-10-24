import type { FloorFinish, WallCovering } from "../types";

/** A group of finishes in a picker: the tab label, and the finishes in the order they show. */
export interface FinishGroup<T extends string> {
  id: string;
  /** Tab label. */
  label: string;
  items: readonly T[];
}

export const FLOOR_GROUPS: readonly FinishGroup<FloorFinish>[] = [
  { id: "wood", label: "Wood", items: ["oak", "wideoak", "herringbone", "chevron", "laminate"] },
  { id: "tile", label: "Tile", items: ["tile", "porcelain", "hexagon", "quarry", "victorian", "encaustic"] },
  { id: "stone", label: "Stone", items: ["stone", "terrazzo", "concrete", "microcement"] },
  { id: "soft", label: "Soft", items: ["carpet", "vinyl"] },
  { id: "plain", label: "Plain", items: ["plain"] },
];

export const WALL_GROUPS: readonly FinishGroup<WallCovering>[] = [
  { id: "paint", label: "Paint", items: ["paint"] },
  { id: "paper", label: "Paper", items: ["stripe", "floral", "rose", "trail", "sprig", "deco", "leaves"] },
  { id: "tile", label: "Tile", items: ["tiles", "squares", "metro", "metroSplash", "zellige"] },
  { id: "panelling", label: "Panelling", items: ["panelling", "panellingFull", "batten", "tongue"] },
  { id: "other", label: "Other", items: ["brick", "limewash", "microcement"] },
];

/** Short names for the tiles under each thumbnail (the long labels stay in summaries and tooltips). */
export const FLOOR_TILE_NAME: Record<FloorFinish, string> = {
  plain: "Plain",
  oak: "Oak",
  wideoak: "Wide oak",
  herringbone: "Herringbone",
  chevron: "Chevron",
  laminate: "Laminate",
  vinyl: "Vinyl",
  carpet: "Carpet",
  tile: "Ceramic",
  porcelain: "Porcelain",
  hexagon: "Hexagon",
  quarry: "Quarry",
  victorian: "Victorian",
  encaustic: "Encaustic",
  stone: "Stone flags",
  terrazzo: "Terrazzo",
  concrete: "Concrete",
  microcement: "Microcement",
};

export const WALL_TILE_NAME: Record<WallCovering, string> = {
  paint: "Paint",
  stripe: "Stripe",
  floral: "Floral",
  rose: "Rose",
  trail: "Leaf trail",
  sprig: "Sprig",
  tiles: "Tiles",
  squares: "Squares",
  brick: "Brick",
  panelling: "Half panel",
  panellingFull: "Full panel",
  batten: "Batten",
  tongue: "Tongue and groove",
  metro: "Metro",
  metroSplash: "Splashback",
  zellige: "Zellige",
  limewash: "Limewash",
  deco: "Deco",
  leaves: "Botanical",
  microcement: "Microcement",
};

/** The group a finish belongs to (the first group if it is in none). */
export function groupOf<T extends string>(groups: readonly FinishGroup<T>[], finish: T): FinishGroup<T> {
  return groups.find((g) => g.items.includes(finish)) ?? groups[0];
}
