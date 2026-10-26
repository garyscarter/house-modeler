import type { GardenItem, KerbStyle, SiteSurface } from "../types";
import type { CostLineId } from "./report";

/**
 * The garden catalogue: furniture, structures, play, utility, lights and
 * plants with typical UK sizes, in metres, placed in Garden mode as
 * `Site.items`. Like lib/catalogue.ts, `w` is the width left-right on the plan
 * at rotation 0, `d` the depth top-bottom, `h` the height; the back of an
 * item is its top edge on the plan (local -y), so wall snapping puts that
 * edge against a wall. Plants: w = d = canopy spread at maturity-ish, h = height.
 *
 * Chunk 0 (Björk) landed the shapes and a seed list; Lily Allen owns this file and its tests (docs/garden-plan.md).
 */

export type GardenCategory =
  | "Dining and lounge"
  | "Cooking and fire"
  | "Pots and planters"
  | "Structures"
  | "Play"
  | "Utility"
  | "Paths"
  | "Lights"
  | "Trees"
  | "Shrubs"
  | "Grasses and perennials"
  | "Hedges and climbers";

export const GARDEN_CATEGORIES: GardenCategory[] = [
  "Dining and lounge",
  "Cooking and fire",
  "Pots and planters",
  "Structures",
  "Play",
  "Utility",
  "Paths",
  "Lights",
  "Trees",
  "Shrubs",
  "Grasses and perennials",
  "Hedges and climbers",
];

/** What an entry is, for the report, the 3D builder and the editor's rules. */
export type GardenKind = "furniture" | "structure" | "play" | "utility" | "path" | "light" | "plant";

/**
 * How an entry is drawn, on the plan (editor/GardenSymbol.tsx) and in 3D
 * (three/SiteItems.tsx). One shape may serve several entries at different sizes.
 */
export type GardenShape =
  // furniture, cooking, pots
  | "dining-set"
  | "lounge-set"
  | "bench"
  | "parasol"
  | "bbq"
  | "fire-pit"
  | "pot"
  | "planter"
  // structures, play, utility
  | "shed"
  | "pergola"
  | "playhouse"
  | "playhouse-kitchen"
  | "mud-kitchen"
  | "trampoline"
  | "bin-store"
  | "recycling-box"
  | "water-butt"
  | "washing-line"
  // paths
  | "stepping-stones"
  // lights
  | "festoon"
  | "bollard"
  | "wall-light"
  // plants
  | "conifer"
  | "birch"
  | "apple"
  | "acer"
  | "olive"
  | "bay"
  | "box-ball"
  | "lavender"
  | "hydrangea"
  | "grass"
  | "buddleia"
  | "climber"
  | "hedge"
  | "bamboo"
  | "perennials";

/** Entries placed by two points rather than a centre and rotation (GardenItem.to). */
export type RunKind = "festoon" | "stones" | "hedge" | "climber";

export interface GardenDef {
  id: string;
  name: string;
  category: GardenCategory;
  kind: GardenKind;
  shape: GardenShape;
  w: number;
  d: number;
  h: number;
  /** Main colour: frame, body, foliage. */
  color: string;
  /** Second colour: parasol canopy, cushions, flowers, roof felt. */
  accent?: string;
  /** Trunk or stem colour of trees and shrubs. */
  trunk?: string;
  /** Round footprint (pots, parasols, trampolines, fire pits, most plants): the plan draws a circle of diameter w. */
  round?: boolean;
  /** Placed by two points (GardenItem.to); `w` is then the run's width across. */
  run?: RunKind;
  /** Spacing along a run, metres: bulbs on a festoon, stones in a path, plants in a hedge. */
  pitch?: number;
  /** Height of the base above the ground, metres, for wall-hung items (wall lights, climbers' lowest leaves). */
  mount?: number;
  /** Snaps its back (local -y) to the nearest boundary wall or house wall when placed (wall lights, climbers, sheds). */
  wall?: boolean;
  /** Emissive colour of the lit parts (bulbs, lamp heads); lights only. */
  glow?: string;
  /** Casts shade in the sun study (lib/siteItems.ts itemOccluders): trees, sheds, playhouses. */
  shade?: boolean;
  /** Dining and lounge sets: chairs by default. */
  seats?: number;
  /** Cost line a new one is priced on (lib/report.ts COST_LINES). Runs are priced per metre on their line. */
  costLine: CostLineId;
  note?: string;
}

const ALU = "#2f3236";
const TIMBER = "#8b6a46";
const LAMP = "#ffd9a0";

/**
 * Every garden entry. Chunk 0 seeded one or two per shape with rough sizes; Lily Allen refines sizes and colours
 * and may add entries. Ids are stable once shipped (they are saved in Site.items[].type).
 */
export const GARDEN_ITEMS: GardenDef[] = [
  // Dining and lounge
  { id: "dining-6", name: "Dining set, table and six chairs", category: "Dining and lounge", kind: "furniture", shape: "dining-set", w: 1.9, d: 2.0, h: 0.75, color: ALU, accent: "#5d6166", seats: 6, costLine: "gardenFurniture", note: "Table 180 × 90 cm" },
  { id: "dining-4-round", name: "Round dining set, four chairs", category: "Dining and lounge", kind: "furniture", shape: "dining-set", w: 1.6, d: 1.6, h: 0.74, color: ALU, round: true, seats: 4, costLine: "gardenFurniture" },
  { id: "bistro-2", name: "Bistro set", category: "Dining and lounge", kind: "furniture", shape: "dining-set", w: 1.2, d: 1.2, h: 0.72, color: "#1f2a24", round: true, seats: 2, costLine: "gardenFurniture" },
  { id: "lounge-corner", name: "Corner lounge set", category: "Dining and lounge", kind: "furniture", shape: "lounge-set", w: 2.4, d: 2.0, h: 0.7, color: "#8a8378", accent: "#d8d3c8", costLine: "gardenFurniture" },
  { id: "bench", name: "Garden bench", category: "Dining and lounge", kind: "furniture", shape: "bench", w: 1.5, d: 0.6, h: 0.85, color: TIMBER, costLine: "gardenFurniture" },
  { id: "bench-stone", name: "Stone bench", category: "Dining and lounge", kind: "furniture", shape: "bench", w: 1.4, d: 0.45, h: 0.45, color: "#a8a398", costLine: "gardenFurniture" },
  { id: "parasol", name: "Parasol, 2.7 m", category: "Dining and lounge", kind: "furniture", shape: "parasol", w: 2.7, d: 2.7, h: 2.4, color: ALU, accent: "#8c8f91", round: true, costLine: "gardenFurniture" },
  { id: "parasol-3m", name: "Parasol, 3 m, cream", category: "Dining and lounge", kind: "furniture", shape: "parasol", w: 3.0, d: 3.0, h: 2.5, color: ALU, accent: "#e6dfcf", round: true, costLine: "gardenFurniture" },
  // Cooking and fire
  { id: "bbq-kettle", name: "Kettle barbecue", category: "Cooking and fire", kind: "furniture", shape: "bbq", w: 0.6, d: 0.6, h: 1.0, color: "#1d1f22", round: true, costLine: "gardenFurniture" },
  { id: "bbq-gas", name: "Gas barbecue", category: "Cooking and fire", kind: "furniture", shape: "bbq", w: 1.3, d: 0.6, h: 1.15, color: "#2b2d30", accent: "#b9bdc2", costLine: "gardenFurniture" },
  { id: "fire-pit", name: "Fire pit", category: "Cooking and fire", kind: "furniture", shape: "fire-pit", w: 0.8, d: 0.8, h: 0.4, color: "#6a3d26", round: true, costLine: "gardenFurniture" },
  // Pots and planters
  { id: "pot-small", name: "Terracotta pot", category: "Pots and planters", kind: "furniture", shape: "pot", w: 0.4, d: 0.4, h: 0.4, color: "#b8693f", accent: "#4f7a3d", round: true, costLine: "gardenFurniture" },
  { id: "pot-large", name: "Large planter pot", category: "Pots and planters", kind: "furniture", shape: "pot", w: 0.6, d: 0.6, h: 0.6, color: "#55595e", accent: "#4f7a3d", round: true, costLine: "gardenFurniture" },
  { id: "pot-xl", name: "Extra large planter", category: "Pots and planters", kind: "furniture", shape: "pot", w: 0.8, d: 0.8, h: 0.8, color: "#3f4348", accent: "#4f7a3d", round: true, costLine: "gardenFurniture" },
  { id: "planter-trough", name: "Trough planter", category: "Pots and planters", kind: "furniture", shape: "planter", w: 1.0, d: 0.4, h: 0.45, color: "#6b5137", accent: "#4f7a3d", costLine: "gardenFurniture" },
  // Structures
  { id: "shed-6x4", name: "Shed, 6 × 4 ft", category: "Structures", kind: "structure", shape: "shed", w: 1.83, d: 1.22, h: 2.1, color: "#7a6248", accent: "#3a3a3a", wall: true, shade: true, costLine: "gardenStructure" },
  { id: "shed-8x6", name: "Shed, 8 × 6 ft", category: "Structures", kind: "structure", shape: "shed", w: 2.44, d: 1.83, h: 2.2, color: "#7a6248", accent: "#3a3a3a", wall: true, shade: true, costLine: "gardenStructure" },
  { id: "shed-4x3", name: "Shed, 4 × 3 ft", category: "Structures", kind: "structure", shape: "shed", w: 1.22, d: 0.91, h: 1.6, color: "#7a6248", accent: "#3a3a3a", wall: true, shade: true, costLine: "gardenStructure" },
  { id: "pergola", name: "Pergola", category: "Structures", kind: "structure", shape: "pergola", w: 3.0, d: 3.0, h: 2.4, color: TIMBER, costLine: "gardenStructure" },
  // Play
  { id: "playhouse", name: "Playhouse", category: "Play", kind: "play", shape: "playhouse", w: 1.4, d: 1.2, h: 1.6, color: "#d9cfb8", accent: "#7c9a6a", shade: true, costLine: "gardenStructure" },
  // Smoby Life Friends playhouse with its summer kitchen: 217 x 155 x 172 cm (retailer listing), cream walls, red roof,
  // green door, kitchen wing with a grill and sink on the left, electronic doorbell by the door.
  { id: "playhouse-smoby-friends", name: "Smoby Life Friends playhouse with kitchen", category: "Play", kind: "play", shape: "playhouse-kitchen", w: 2.17, d: 1.55, h: 1.72, color: "#efe6cf", accent: "#c2412f", shade: true, costLine: "gardenStructure", note: "Summer kitchen on the left with a grill and sink, picnic area in front, doorbell; about 1.7 m tall" },
  { id: "mud-kitchen", name: "Mud kitchen", category: "Play", kind: "play", shape: "mud-kitchen", w: 1.0, d: 0.5, h: 0.95, color: "#a98b62", wall: true, costLine: "gardenFurniture" },
  { id: "trampoline-8ft", name: "Trampoline, 8 ft with net", category: "Play", kind: "play", shape: "trampoline", w: 2.44, d: 2.44, h: 2.3, color: "#2b2e33", accent: "#3d6fb0", round: true, costLine: "gardenStructure" },
  // Utility
  { id: "bin-store", name: "Bin store, two bins", category: "Utility", kind: "utility", shape: "bin-store", w: 1.5, d: 0.85, h: 1.25, color: "#5f6368", wall: true, costLine: "gardenFurniture" },
  { id: "recycling-box", name: "Recycling box", category: "Utility", kind: "utility", shape: "recycling-box", w: 0.6, d: 0.4, h: 0.35, color: "#5e6266", costLine: "gardenFurniture" },
  { id: "bin-store-single", name: "Bin store, one bin", category: "Utility", kind: "utility", shape: "bin-store", w: 0.8, d: 0.85, h: 1.25, color: "#5f6368", wall: true, costLine: "gardenFurniture" },
  { id: "water-butt", name: "Water butt", category: "Utility", kind: "utility", shape: "water-butt", w: 0.6, d: 0.6, h: 0.95, color: "#2f4a38", round: true, wall: true, costLine: "gardenFurniture" },
  { id: "washing-line", name: "Rotary washing line", category: "Utility", kind: "utility", shape: "washing-line", w: 2.6, d: 2.6, h: 1.8, color: "#c7cacd", round: true, costLine: "gardenFurniture" },
  // Paths
  { id: "stepping-stones", name: "Stepping stones", category: "Paths", kind: "path", shape: "stepping-stones", w: 0.45, d: 0.45, h: 0.04, color: "#9a958b", run: "stones", pitch: 0.6, costLine: "newPaving" },
  // Lights
  { id: "festoon", name: "Festoon lights", category: "Lights", kind: "light", shape: "festoon", w: 0.08, d: 0.08, h: 2.4, color: "#1d1d1d", glow: LAMP, run: "festoon", pitch: 0.5, costLine: "gardenLighting" },
  { id: "festoon-warm", name: "Festoon lights, warm white (large bulbs)", category: "Lights", kind: "light", shape: "festoon", w: 0.1, d: 0.1, h: 2.4, color: "#1d1d1d", glow: "#ffcf8a", run: "festoon", pitch: 0.6, costLine: "gardenLighting" },
  { id: "bollard", name: "Bollard light", category: "Lights", kind: "light", shape: "bollard", w: 0.15, d: 0.15, h: 0.6, color: "#2b2d30", glow: LAMP, round: true, costLine: "gardenLighting" },
  { id: "wall-light", name: "Wall light", category: "Lights", kind: "light", shape: "wall-light", w: 0.12, d: 0.12, h: 0.2, mount: 1.7, color: "#202225", glow: LAMP, wall: true, costLine: "gardenLighting" },
  // Trees
  { id: "conifer", name: "Conifer", category: "Trees", kind: "plant", shape: "conifer", w: 1.2, d: 1.2, h: 4, color: "#2e4a2c", trunk: "#5a4030", round: true, shade: true, costLine: "gardenPlanting" },
  { id: "silver-birch", name: "Silver birch", category: "Trees", kind: "plant", shape: "birch", w: 3, d: 3, h: 6, color: "#7e9e4f", trunk: "#e8e4dc", round: true, shade: true, costLine: "gardenPlanting" },
  { id: "apple-tree", name: "Apple tree", category: "Trees", kind: "plant", shape: "apple", w: 3, d: 3, h: 3.5, color: "#5f8a3a", trunk: "#6b4f3a", accent: "#c8402d", round: true, shade: true, costLine: "gardenPlanting" },
  { id: "cherry-ornamental", name: "Flowering cherry", category: "Trees", kind: "plant", shape: "apple", w: 4, d: 4, h: 5, color: "#6d8f46", trunk: "#5a4030", accent: "#f0b8cc", round: true, shade: true, costLine: "gardenPlanting" },
  { id: "acer", name: "Japanese maple", category: "Trees", kind: "plant", shape: "acer", w: 2, d: 2, h: 2, color: "#a3322b", trunk: "#5a4030", round: true, costLine: "gardenPlanting" },
  { id: "olive", name: "Olive tree", category: "Trees", kind: "plant", shape: "olive", w: 1.5, d: 1.5, h: 2.2, color: "#8a9a73", trunk: "#7a6a55", round: true, costLine: "gardenPlanting" },
  { id: "bay-standard", name: "Bay tree (standard)", category: "Trees", kind: "plant", shape: "bay", w: 0.8, d: 0.8, h: 1.8, color: "#355d33", trunk: "#6b4f3a", round: true, costLine: "gardenPlanting" },
  // Shrubs
  { id: "box-ball", name: "Box ball", category: "Shrubs", kind: "plant", shape: "box-ball", w: 0.6, d: 0.6, h: 0.6, color: "#3f6b35", round: true, costLine: "gardenPlanting" },
  { id: "hydrangea", name: "Hydrangea", category: "Shrubs", kind: "plant", shape: "hydrangea", w: 1.2, d: 1.2, h: 1.2, color: "#4f7a3d", accent: "#8fa6d8", round: true, costLine: "gardenPlanting" },
  { id: "rose-shrub", name: "Shrub rose", category: "Shrubs", kind: "plant", shape: "hydrangea", w: 0.9, d: 0.9, h: 1.0, color: "#4a7038", accent: "#d86a8a", round: true, costLine: "gardenPlanting" },
  { id: "buddleia", name: "Buddleia", category: "Shrubs", kind: "plant", shape: "buddleia", w: 2.5, d: 2.5, h: 3, color: "#5a7346", accent: "#8a5ab0", trunk: "#6b5a45", round: true, shade: true, costLine: "gardenPlanting" },
  // Grasses and perennials
  { id: "lavender", name: "Lavender", category: "Grasses and perennials", kind: "plant", shape: "lavender", w: 0.6, d: 0.6, h: 0.5, color: "#7d8f6a", accent: "#8b7ac0", round: true, costLine: "gardenPlanting" },
  { id: "ornamental-grass", name: "Ornamental grass", category: "Grasses and perennials", kind: "plant", shape: "grass", w: 0.8, d: 0.8, h: 1.0, color: "#b6a873", round: true, costLine: "gardenPlanting" },
  { id: "perennials", name: "Fern and perennial mix", category: "Grasses and perennials", kind: "plant", shape: "perennials", w: 1.0, d: 1.0, h: 0.6, color: "#4d7a3e", accent: "#e0b0c8", round: true, costLine: "gardenPlanting" },
  // Hedges and climbers
  { id: "hedge", name: "Hedge", category: "Hedges and climbers", kind: "plant", shape: "hedge", w: 0.6, d: 0.6, h: 1.5, color: "#3c5f30", run: "hedge", pitch: 0.4, shade: true, costLine: "hedging" },
  { id: "bamboo", name: "Bamboo screen", category: "Hedges and climbers", kind: "plant", shape: "bamboo", w: 0.5, d: 0.5, h: 2.5, color: "#6f8f45", run: "hedge", pitch: 0.3, shade: true, costLine: "hedging" },
  { id: "climber", name: "Climber on a wall", category: "Hedges and climbers", kind: "plant", shape: "climber", w: 0.3, d: 0.3, h: 2.2, color: "#4a6e36", accent: "#e6e6f0", run: "climber", pitch: 0.5, wall: true, costLine: "hedging" },
];

export const gardenDef = (id: string): GardenDef | undefined => GARDEN_ITEMS.find((g) => g.id === id);

export const isPlant = (def: Pick<GardenDef, "kind">) => def.kind === "plant";
export const isLight = (def: Pick<GardenDef, "kind">) => def.kind === "light";

/** Entries matching a search (name, category, note) in one category or all, catalogue order. */
export function filterGarden(query: string, category: GardenCategory | "All"): GardenDef[] {
  const q = query.trim().toLowerCase();
  return GARDEN_ITEMS.filter(
    (g) => (category === "All" || g.category === category) && (!q || `${g.name} ${g.category} ${g.note ?? ""}`.toLowerCase().includes(q)),
  );
}

/** An item's size with its overrides applied: w, d, h in metres (catalogue defaults when unset). */
export function itemSize(item: Pick<GardenItem, "type" | "w" | "d" | "h">): { w: number; d: number; h: number } {
  const def = gardenDef(item.type);
  return { w: item.w ?? def?.w ?? 0.5, d: item.d ?? def?.d ?? 0.5, h: item.h ?? def?.h ?? 0.5 };
}

/** Kerb styles: label, width across the top, default height above the surface, colour (3D material is Lorde's). */
export interface KerbDef {
  label: string;
  width: number;
  height: number;
  color: string;
}

export const KERBS: Record<KerbStyle, KerbDef> = {
  brick: { label: "Brick", width: 0.1025, height: 0, color: "#9c4f3a" },
  paving: { label: "Reclaimed paving blocks", width: 0.1, height: 0, color: "#5a4f4a" },
  sleeper: { label: "Timber sleeper", width: 0.2, height: 0.1, color: "#6b5137" },
  corten: { label: "Corten steel", width: 0.006, height: 0.05, color: "#8a4a26" },
  render: { label: "Rendered block", width: 0.15, height: 0, color: "#e6e1d6" },
  none: { label: "None", width: 0, height: 0, color: "#000000" },
};

/**
 * The kerb a surface is drawn with: its style (absent: "brick" round a raised
 * bed, slope.base > 0, else "none"; only lawns and beds take a kerb) and its
 * height above the surface's top (absent: the style's default).
 */
export function kerbOf(surface: Pick<SiteSurface, "kind" | "slope" | "kerb" | "kerbHeight">): { style: KerbStyle; height: number } {
  if (surface.kind !== "lawn" && surface.kind !== "bed") return { style: "none", height: 0 };
  const style: KerbStyle = surface.kerb ?? ((surface.slope?.base ?? 0) > 0 ? "brick" : "none");
  return { style, height: style === "none" ? 0 : Math.max(0, surface.kerbHeight ?? KERBS[style].height) };
}
