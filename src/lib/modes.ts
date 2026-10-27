import type { Tab } from "../store";
import type { EdgePick } from "./decorPick";
import type { IconName } from "../components/icons";

/** editFloorId value that opens the site editor instead of a floor (re-exported by the store). */
export const SITE_EDIT_ID = "site";

export type Mode = "build" | "decorate" | "furnish" | "electrics" | "garden" | "plot" | "review";
export const MODES: Mode[] = ["build", "decorate", "furnish", "electrics", "garden", "plot", "review"];
export const MODE_LABEL: Record<Mode, string> = {
  build: "Build",
  decorate: "Decorate",
  furnish: "Furnish",
  electrics: "Electrics",
  garden: "Garden",
  plot: "Plot",
  review: "Review",
};
/** The icon each mode shows in the phone tab bar. */
export const MODE_ICON: Record<Mode, IconName> = {
  build: "house",
  decorate: "brush",
  furnish: "sofa",
  electrics: "plug",
  garden: "flower",
  plot: "compass",
  review: "clipboard",
};
/** The muted line under a mode's inspector title. */
export const MODE_SUBTITLE: Record<Mode, string> = {
  build: "Rooms, walls, doors and stairs",
  decorate: "Floors, walls and colours",
  furnish: "Place furniture",
  electrics: "Lights, switches, sockets and circuits",
  garden: "Surfaces, planting, furniture and lights",
  plot: "Boundaries, neighbours, orientation and roof",
  review: "Areas, costs and planning",
};
export const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as string[]).includes(v);

export type Tool = "select" | "rect" | "canopy" | "room" | "door" | "window" | "gap" | "wall" | "measure" | "calibrate" | "place";

/** The plan toolbar buttons each mode shows, in order. */
export const PLAN_TOOLS: Record<Mode, Tool[]> = {
  build: ["select", "rect", "canopy", "room", "door", "window", "gap", "wall", "measure", "calibrate"],
  decorate: [],
  furnish: ["select", "measure"],
  // "place" is armed by the Add button (as in Furnish), never drawn as a rail button.
  electrics: ["select", "measure", "place"],
  garden: [],
  review: ["select", "measure"],
  plot: [],
};

export type SelKind = "room" | "edge" | "opening" | "wall" | "canopy" | "fixture" | "corner";
const SELECTABLE: Record<Mode, SelKind[]> = {
  build: ["room", "opening", "wall", "canopy", "corner"],
  decorate: ["room", "edge", "wall"],
  furnish: ["fixture"],
  // Only electrical points (lib/electrics.ts isElectricalItem): the plan filters the fixtures it hit-tests.
  electrics: ["fixture"],
  garden: [],
  plot: [],
  review: [],
};
export const canSelect = (mode: Mode, kind: SelKind): boolean => SELECTABLE[mode].includes(kind);

/** The plan-only selections PlanEditor keeps in local state. */
export interface PlanSelection {
  room?: string;
  opening?: string;
  wall?: string;
  fixtures?: string[];
  canopy?: number;
}

/** Drop the selections the mode cannot hold. */
export function pruneSelection(mode: Mode, s: PlanSelection): PlanSelection {
  const out: PlanSelection = {};
  if (s.room !== undefined && canSelect(mode, "room")) out.room = s.room;
  if (s.opening !== undefined && canSelect(mode, "opening")) out.opening = s.opening;
  if (s.wall !== undefined && canSelect(mode, "wall")) out.wall = s.wall;
  if (s.fixtures?.length && canSelect(mode, "fixture")) out.fixtures = s.fixtures;
  if (s.canopy !== undefined && canSelect(mode, "canopy")) out.canopy = s.canopy;
  return out;
}

export interface ModeUi {
  mode: Mode;
  tab: Tab;
  editFloorId: string | null;
  floorBeforeSite: string | null;
  selectedRoomId: string | null;
  selectedEdge: EdgePick | null;
  /** Garden: the ids of the selected garden items (cleared on every mode switch). */
  gardenSel?: string[];
  /** Electrics: the switch whose lights are being linked (clicking a light toggles it in the switch's `controls`); null = not linking. */
  linkSwitchId?: string | null;
}

/** Modes whose plan places, selects and moves fixtures (Furnish: furniture and lights; Electrics: electrical points and lights). */
export const editsFixtures = (m: Mode) => m === "furnish" || m === "electrics";

/** Tapping a room's floor selects it in these modes. */
export const roomTapSelects = (m: Mode) => m === "build" || m === "decorate";

/** Modes whose plan tab is the site editor (SITE_EDIT_ID) rather than a floor. */
export const editsSite = (m: Mode) => m === "plot" || m === "garden";

/** Put the plan on the site editor, remembering the floor it was on (nothing to do if it is already there). */
export function siteEditPatch(ui: Pick<ModeUi, "editFloorId">): Partial<ModeUi> {
  return ui.editFloorId === SITE_EDIT_ID ? {} : { floorBeforeSite: ui.editFloorId, editFloorId: SITE_EDIT_ID };
}

/** The UI fields that change when the mode does. Selections the new mode cannot hold are cleared. */
export function modeSwitchPatch(ui: ModeUi, next: Mode): Partial<ModeUi> {
  const patch: Partial<ModeUi> = { mode: next, gardenSel: [], linkSwitchId: null };
  if (!roomTapSelects(next)) patch.selectedRoomId = null;
  if (next !== "decorate") patch.selectedEdge = null;
  if (editsSite(next)) {
    if (ui.tab === "plan") Object.assign(patch, siteEditPatch(ui));
  } else if (ui.editFloorId === SITE_EDIT_ID) {
    patch.editFloorId = ui.floorBeforeSite;
    patch.floorBeforeSite = null;
  }
  return patch;
}
