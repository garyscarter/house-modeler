import type { Floor, HouseModel, VariantKey } from "../types";
import type { Tab, ViewMode } from "../store";
import { belongsToHouse, useHouse } from "./house";

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
const NUMBERED_FLOOR = ["First", "Second", "Third"];

export function floorDisplayName(name: string): string {
  // The built-in house calls its upper storey "Floor 1"; read it as a person would.
  const n = /^floor (\d)$/i.exec(name.trim());
  if (n && NUMBERED_FLOOR[+n[1] - 1]) return `${NUMBERED_FLOOR[+n[1] - 1]} floor`;
  if (!/^(lower ground|ground|first|second|third|top) floor$/i.test(name)) return name;
  return name[0].toUpperCase() + name.slice(1).toLowerCase();
}

/** The name shown for a house: the active house's name when the layout is (or is based on) one of its built-ins, else "House". */
export function houseName(m: HouseModel | undefined): string {
  const id = m?.preset?.id ?? m?.basedOn?.id;
  const house = useHouse.getState().house;
  return house && belongsToHouse(house, id) ? house.name : "House";
}

/** Floors from the lowest level up (does not mutate). */
export function floorsByLevel(floors: Floor[]): Floor[] {
  return [...floors].sort((a, b) => a.level - b.level);
}

/** The floor at the same level in another layout (floor ids differ between layouts); the nearest level if none matches. */
export function floorAtLevel(floors: Floor[], level: number): Floor | undefined {
  let best: Floor | undefined;
  for (const f of floors) if (!best || Math.abs(f.level - level) < Math.abs(best.level - level)) best = f;
  return best;
}

type Targetish = { tagName?: string; closest?: (s: string) => unknown } | null;
const tag = (t: Targetish) => t?.tagName?.toLowerCase();

/** Tab flips Plan/3D only from the page itself (body, a canvas, the plan, an svg), never from a control, card, menu or dialog. */
export function tabKeyApplies(target: EventTarget | null): boolean {
  const t = target as Targetish;
  if (t?.closest?.(".inspector-card, .popover, .house-menu, .dock, .tool-rail, [role=\"dialog\"], [role=\"menu\"]")) return false;
  const g = tag(t);
  return !t || g === "body" || g === "html" || g === "canvas" || g === "svg" || !!t.closest?.(".plan-canvas") || (g !== undefined && !!t.closest?.("svg"));
}

/** Space peeks unless it is on something Space already presses or types into. */
export function spaceKeyApplies(target: EventTarget | null): boolean {
  const g = tag(target as Targetish);
  return !(g === "button" || g === "a" || g === "input" || g === "select" || g === "textarea" || g === "summary");
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
  tab: Tab;
  variants: Partial<Record<VariantKey, unknown>>;
}

/**
 * Holding Space shows the other layout. On: only when not already peeking, the 3D view (if on 3D) is single or
 * overlay and the other layout exists. Off: only when peeking. Anything else changes nothing.
 */
export function peekPatch(s: PeekState, on: boolean): Partial<Pick<PeekState, "peek" | "peekReturn" | "activeVariant">> {
  if (on) {
    if (s.peek || (s.tab === "3d" && s.viewMode !== "single" && s.viewMode !== "overlay")) return {};
    const other: VariantKey = s.activeVariant === "current" ? "proposed" : "current";
    if (!s.variants[other]) return {};
    return { peek: true, peekReturn: s.activeVariant, activeVariant: other };
  }
  if (!s.peek) return {};
  return { peek: false, peekReturn: null, activeVariant: s.peekReturn ?? s.activeVariant };
}
