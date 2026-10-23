import type { Floor, HouseModel, VariantKey } from "../types";
import type { Tab, ViewMode } from "../store";

/** Window events the top bar (and anything else) dispatches to open the palette and the shortcut sheet. */
export const OPEN_PALETTE = "house:open-palette";
export const OPEN_SHORTCUTS = "house:open-shortcuts";

/** Studio is the light solid look; Glass floats translucent cards over a full-bleed view. */
export type Look = "studio" | "glass";
export const isLook = (v: unknown): v is Look => v === "studio" || v === "glass";

/**
 * Display name for a floor: "Ground Floor" reads "Ground floor". Names that are not one of the
 * stock floor names are left as typed. Display only: the model keeps the raw name (photos match on it).
 */
export function floorDisplayName(name: string): string {
  if (!/^(lower ground|ground|first|second|third|top) floor$/i.test(name)) return name;
  return name[0].toUpperCase() + name.slice(1).toLowerCase();
}

/** The name shown for a house: the built-in listing by its public id, else "House". */
export function houseName(m: HouseModel | undefined): string {
  const id = m?.preset?.id ?? m?.basedOn?.id;
  return id && id.startsWith("listing-91770873") ? "Listing 91770873" : "House";
}

/** Floors from the lowest level up (does not mutate). */
export function floorsByLevel(floors: Floor[]): Floor[] {
  return [...floors].sort((a, b) => a.level - b.level);
}

export interface FloorUi {
  tab: Tab;
  maxLevel: number | null;
  editFloorId: string | null;
}

/** The floor the plan is on: the edit floor if it exists, else the lowest. */
function editFloorOf(ui: FloorUi, floors: Floor[]): Floor | undefined {
  return floors.find((f) => f.id === ui.editFloorId) ?? floorsByLevel(floors)[0];
}

/** Which dock floor button is lit: a floor id, or "all" (3D with no cut). */
export function dockFloorActive(ui: FloorUi, floors: Floor[]): string | "all" {
  if (ui.tab === "3d") {
    if (ui.maxLevel === null) return "all";
    const at = floors.find((f) => f.level === ui.maxLevel);
    if (at) return at.id;
    // A cut between levels lights the highest floor it still shows.
    const below = floorsByLevel(floors).filter((f) => f.level <= (ui.maxLevel as number));
    return below.length ? below[below.length - 1].id : "all";
  }
  return editFloorOf(ui, floors)?.id ?? "all";
}

/** The state change for picking a dock floor (or "all", which only does something in 3D). */
export function dockFloorPick(ui: FloorUi, floors: Floor[], pick: string | "all"): Partial<FloorUi> {
  if (pick === "all") return ui.tab === "3d" ? { maxLevel: null } : {};
  const f = floors.find((x) => x.id === pick);
  if (!f) return {};
  return ui.tab === "3d" ? { editFloorId: f.id, maxLevel: f.level } : { editFloorId: f.id };
}

/** "1".."9" pick the nth floor by level, "0" is all floors; anything else (or no such floor) is null. */
export function floorForKey(floors: Floor[], key: string): string | "all" | null {
  if (key === "0") return "all";
  if (!/^[1-9]$/.test(key)) return null;
  return floorsByLevel(floors)[Number(key) - 1]?.id ?? null;
}

/** Switching Plan/3D: a 3D cut follows the floor the plan was on. */
export function tabSwitchPatch(ui: FloorUi, floors: Floor[], next: Tab): Partial<FloorUi> {
  const patch: Partial<FloorUi> = { tab: next };
  if (next === "3d" && ui.maxLevel !== null) {
    const f = editFloorOf(ui, floors);
    if (f) patch.maxLevel = f.level;
  }
  return patch;
}

export interface PeekState {
  peek: boolean;
  peekReturn: VariantKey | null;
  activeVariant: VariantKey;
  viewMode: ViewMode;
  variants: Partial<Record<VariantKey, unknown>>;
}

/**
 * Holding Space shows the other layout. On: only when not already peeking, the view is single or
 * overlay and the other layout exists. Off: only when peeking. Anything else changes nothing.
 */
export function peekPatch(s: PeekState, on: boolean): Partial<Pick<PeekState, "peek" | "peekReturn" | "activeVariant">> {
  if (on) {
    if (s.peek || (s.viewMode !== "single" && s.viewMode !== "overlay")) return {};
    const other: VariantKey = s.activeVariant === "current" ? "proposed" : "current";
    if (!s.variants[other]) return {};
    return { peek: true, peekReturn: s.activeVariant, activeVariant: other };
  }
  if (!s.peek) return {};
  return { peek: false, peekReturn: null, activeVariant: s.peekReturn ?? s.activeVariant };
}
