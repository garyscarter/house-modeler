import { create } from "zustand";
import { useStore } from "./store";
import type { LensClass } from "./lib/walkLens";
import type { DoorStates, TourState, WalkGoal, WalkLensChoice, WalkPose, WalkRoute, WalkStart } from "./lib/walkTypes";

type Main = ReturnType<typeof useStore.getState>;
/** The view settings a walk changes, saved when it starts and put back when it ends. */
export type WalkUiSnapshot = Pick<Main, "viewMode" | "showCeilings" | "maxLevel" | "sectionHeight" | "showLabels" | "showExterior" | "showSite" | "measureTool">;
/** One view, ceilings on, every floor, no section cut or labels, roofs and garden shown, tape measure off. */
export const WALK_UI: WalkUiSnapshot = { viewMode: "single", showCeilings: true, maxLevel: null, sectionHeight: null, showLabels: false, showExterior: true, showSite: true, measureTool: false };
const snapshot = (m: Main): WalkUiSnapshot => ({
  viewMode: m.viewMode, showCeilings: m.showCeilings, maxLevel: m.maxLevel, sectionHeight: m.sectionHeight,
  showLabels: m.showLabels, showExterior: m.showExterior, showSite: m.showSite, measureTool: m.measureTool,
});

export const TOUR_OFF: TourState = { status: "off", stops: [], index: 0, phase: "walking" };
export interface WalkHint { text: string; id: number; ms: number }
/** What the HUD names: the room you are in (null between rooms), the storey, and whether you are out in the garden. */
export interface WalkWhere { level: number; roomName: string | null; outside: boolean }

/** The lens in force on this screen, for the eye menu and the look-round: the choice, the canvas, its fields of view and what each choice would give. */
export interface WalkLensInfo {
  choice: WalkLensChoice;
  w: number;
  h: number;
  hfov: number;
  vfov: number;
  cls: LensClass;
  /** Degrees across for each choice on this screen. */
  options: Record<WalkLensChoice, number>;
}

export interface WalkState {
  on: boolean;
  /** A start waiting for the 3D view to place the walker (WalkControls takes it). */
  pending: WalkStart | null;
  /** Updated every frame while moving: subscribe transiently (useWalk.subscribe), never select it in render. */
  pose: WalkPose | null;
  doors: DoorStates;
  /** Bumped when a door finishes moving, so the viewer redraws shadows. */
  doorsSettled: number;
  route: WalkRoute | null;
  /** A place asked for from the HUD (mini-map), taken by WalkControls. */
  goal: WalkGoal | null;
  tour: TourState;
  hint: WalkHint | null;
  where: WalkWhere | null;
  showMap: boolean;
  before: WalkUiSnapshot | null;
  lens: WalkLensInfo | null;

  requestWalk: (start: WalkStart) => void;
  stopWalk: () => void;
  placed: (pose: WalkPose, doors: DoorStates) => void;
  setPose: (pose: WalkPose) => void;
  /** Add doors not seen yet (a layout flip, an edit); doors already set keep their state. */
  mergeDoors: (doors: DoorStates) => void;
  toggleDoor: (key: string, initial: boolean) => void;
  setDoor: (key: string, open: boolean) => void;
  doorSettled: () => void;
  setRoute: (route: WalkRoute | null) => void;
  requestGoal: (goal: WalkGoal) => void;
  takeGoal: () => WalkGoal | null;
  playTour: () => void;
  pauseTour: () => void;
  stopTour: () => void;
  setTour: (patch: Partial<TourState>) => void;
  say: (text: string, ms?: number) => void;
  clearHint: () => void;
  setWhere: (where: WalkWhere | null) => void;
  setShowMap: (show: boolean) => void;
  setLens: (lens: WalkLensInfo | null) => void;
  /** Swap As listed and Proposed where you stand (the Flip button; holding Space peeks as everywhere else). */
  flipLayout: () => void;
}

let hintId = 0;
const sameWhere = (a: WalkWhere | null, b: WalkWhere | null) => a === b || (!!a && !!b && a.level === b.level && a.roomName === b.roomName && a.outside === b.outside);
const CLEAR = { pending: null, pose: null, doors: {}, route: null, goal: null, tour: TOUR_OFF, hint: null, where: null, lens: null } as const;

export const useWalk = create<WalkState>()((set, get) => ({
  on: false, ...CLEAR, doorsSettled: 0, showMap: true, before: null,
  requestWalk: (start) => {
    const main = useStore.getState();
    const before = get().before ?? snapshot(main);
    if (main.peek) main.setPeek(false);
    main.setUi({ ...WALK_UI, tab: "3d" });
    set({ on: true, ...CLEAR, pending: start, before });
  },
  stopWalk: () => {
    const { on, before } = get();
    if (!on) return;
    set({ on: false, ...CLEAR, before: null });
    if (before) useStore.getState().setUi(before);
  },
  placed: (pose, doors) => set({ pending: null, pose, doors }),
  setPose: (pose) => set({ pose }),
  mergeDoors: (doors) => set((s) => ({ doors: { ...doors, ...s.doors } })),
  toggleDoor: (key, initial) => set((s) => ({ doors: { ...s.doors, [key]: !(s.doors[key] ?? initial) } })),
  setDoor: (key, open) => set((s) => ({ doors: { ...s.doors, [key]: open } })),
  doorSettled: () => set((s) => ({ doorsSettled: s.doorsSettled + 1 })),
  setRoute: (route) => set({ route }),
  requestGoal: (goal) => set({ goal }),
  takeGoal: () => {
    const g = get().goal;
    if (g) set({ goal: null });
    return g;
  },
  playTour: () => set((s) => ({ tour: s.tour.status === "off" ? { ...TOUR_OFF, status: "playing" } : { ...s.tour, status: "playing" } })),
  pauseTour: () => set((s) => (s.tour.status === "playing" ? { tour: { ...s.tour, status: "paused" } } : s)),
  stopTour: () => set({ tour: TOUR_OFF }),
  setTour: (patch) => set((s) => ({ tour: { ...s.tour, ...patch } })),
  say: (text, ms = 3500) => set({ hint: { text, id: ++hintId, ms } }),
  clearHint: () => set({ hint: null }),
  setWhere: (where) => set((s) => (sameWhere(s.where, where) ? s : { where })),
  setShowMap: (showMap) => set({ showMap }),
  setLens: (lens) => set({ lens }),
  flipLayout: () => {
    const m = useStore.getState();
    if (m.peek) return;
    const other = m.activeVariant === "current" ? "proposed" : "current";
    if (m.variants[other]) m.setUi({ activeVariant: other });
  },
}));

if (import.meta.env?.DEV && typeof window !== "undefined") Object.assign(window, { __walkStore: useWalk });
