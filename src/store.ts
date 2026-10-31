import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Floor, HouseModel, MyPiece, Room, SavedView, Site, VariantKey } from "./types";
import { applyPiece, unlinkPiece } from "./lib/myFurniture";
import type { LightsMaster } from "./lib/lights";
import { imageAwareStorage, useHydration } from "./lib/persist";
import { setLink, syncLinks } from "./lib/roomLinks";
import { mergeRooms, type MergeResult } from "./lib/mergeRooms";
import { migratePersisted, PERSIST_VERSION } from "./lib/migrate";
import { copySiteOf, setSiteOf, siteOf, updateSiteOf, type Sites } from "./lib/sites";
import { editsSite, isMode, modeSwitchPatch, SITE_EDIT_ID, type Mode } from "./lib/modes";
import type { EdgePick } from "./lib/decorPick";
import { peekPatch } from "./lib/studio";
import { activeHouseId, houseKey, storageSuffix } from "./lib/house";
import type { WalkAdapt, WalkLensChoice, WalkStepMode } from "./lib/walkTypes";

export type ViewMode = "single" | "side-by-side" | "overlay" | "wipe";
const VIEW_MODES: ViewMode[] = ["single", "side-by-side", "overlay", "wipe"];
export type Tab = "3d" | "plan";
/** editFloorId value that opens the site editor instead of a floor. */
export { SITE_EDIT_ID };

export interface Settings {
  /** Rendering quality: "high" adds ambient occlusion and soft shadows. */
  quality: "high" | "balanced" | "low";
  /** Walk-through eye height in metres (1.0–2.0); absent = 1.7. Read it through eyeHeightOf (lib/walkTypes). */
  eyeHeight?: number;
  /** Walk-through lens: "narrow" | "normal" | "wide" (legacy saves hold 75, 90 or 100 degrees); absent = normal. Read it through walkLensOf (lib/walkTypes). */
  walkLens?: WalkLensChoice | number;
  /** Walk-through eye adaptation between bright and dim rooms; absent = natural. Read it through walkAdaptOf (lib/walkTypes). */
  walkAdapt?: WalkAdapt;
  /** Walk-through natural step (gentle, gaze-steadied head motion); absent = off. Read it through walkStepOf (lib/walkTypes). */
  walkStep?: WalkStepMode;
}

/** Sun study controls. */
export interface SunState {
  /** Drive the main light from the real sun position for the site. */
  enabled: boolean;
  /** Day of the year, 1-366. */
  dayOfYear: number;
  /** Local clock time in hours (e.g. 14.5 = 2:30 pm), UK time incl. BST. */
  hour: number;
  /** The Lights master: auto (on from dusk), on or off. Absent in older saves = auto (see lib/lights.ts `lightsMaster`). */
  lights?: LightsMaster;
}

interface Snapshot {
  variants: Partial<Record<VariantKey, HouseModel>>;
  sites: Sites;
  pieces: MyPiece[];
}

interface State {
  variants: Partial<Record<VariantKey, HouseModel>>;
  /**
   * Plot, neighbours and orientation for each variant (see lib/sites.ts).
   * Kept beside the models rather than inside them so a plot edit leaves the
   * house model untouched and the 3D house is not rebuilt for it.
   */
  sites: Sites;
  /** Furniture the owner already has, measured (see lib/myFurniture.ts). Kept when a project is reset. */
  pieces: MyPiece[];
  settings: Settings;
  sun: SunState;
  /** Cost rates for the report, keyed by line item. */
  costRates: Record<string, number>;
  /** Named 3D camera views (project-level; not undoable). */
  savedViews: SavedView[];

  /** Undo history (not persisted). */
  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;

  // UI (not persisted, except `mode`)
  /** What the person is doing: Build, Decorate, Furnish, Garden, Plot or Review. Persisted per browser, not synced, no undo. */
  mode: Mode;
  /** Decorate: the wall face picked on the selected room (null = the room's floor). */
  selectedEdge: EdgePick | null;
  /** The floor the plan showed before Plot opened the site editor, so leaving Plot goes back to it. */
  floorBeforeSite: string | null;
  /** Garden mode: the selected garden items, shared by the site editor and the Garden panel. Not persisted; cleared by a mode switch. */
  gardenSel: string[];
  /** Electrics mode: the switch whose lights are being linked on the plan (see lib/modes.ts ModeUi). Not persisted; cleared by a mode switch. */
  linkSwitchId: string | null;
  /** Which rocker (gang, 0-based) of the linking switch the tapped lights go on. */
  linkGang: number;
  setMode: (m: Mode) => void;
  /** The mode Review was opened from, so closing it goes back there. Persisted. */
  modeBeforeReview: Mode | null;
  /** Close Review and return to the mode it was opened from (Build when unknown). */
  leaveReview: () => void;
  /** The room the pointer is over, in the plan or 3D, lit in both. Not persisted. */
  hoveredRoomId: string | null;
  /** Space held: showing the other layout. Not persisted, no undo step. */
  peek: boolean;
  /** The layout to go back to when the peek ends. */
  peekReturn: VariantKey | null;
  setPeek: (on: boolean) => void;
  activeVariant: VariantKey;
  tab: Tab;
  editFloorId: string | null;
  viewMode: ViewMode;
  selectedRoomId: string | null;
  showLabels: boolean;
  showCeilings: boolean;
  /** Draw swing doors open (at their open angle) rather than shut. Persisted. */
  doorsOpen: boolean;
  /** Floorplan image drawn behind the plan editor (shown, 0.1-1 opacity). Persisted. */
  planImage: { show: boolean; opacity: number };
  /** Draw walls at their real thickness in the plan editor. Persisted per browser, not synced. */
  planWalls: boolean;
  /** Hide floors above this level in the 3D view (null = show all). */
  maxLevel: number | null;
  /** Section cut in the 3D view: hide everything above this many metres over the ground floor (null = off). Not persisted. */
  sectionHeight: number | null;
  /** Draw roofs and canopies. */
  showExterior: boolean;
  /** Draw the plot, garden and neighbouring buildings. */
  showSite: boolean;
  /** The 3D view's tape measure is armed (clicks place points). Not persisted; off when the tab leaves 3D. */
  measureTool: boolean;
  /** A path-traced still in progress: which 3D view (its capture id) and how many samples of how many. Not persisted. */
  rendering: { id: string; done: number; total: number } | null;

  setSettings: (s: Partial<Settings>) => void;
  setSun: (s: Partial<SunState>) => void;
  setCostRates: (r: Record<string, number>) => void;
  addSavedView: (v: SavedView) => void;
  updateSavedView: (id: string, patch: Partial<Pick<SavedView, "name" | "position" | "target" | "maxLevel">>) => void;
  removeSavedView: (id: string) => void;
  setVariant: (k: VariantKey, m: HouseModel | undefined) => void;
  /** Copy one variant over another (e.g. "As listed" to "Proposed" to start a design). */
  copyVariant: (from: VariantKey, to: VariantKey) => void;
  updateFloor: (k: VariantKey, floorId: string, patch: Partial<Floor> | ((f: Floor) => Floor)) => void;
  updateRoom: (k: VariantKey, floorId: string, roomId: string, patch: Partial<Room>) => void;
  /**
   * Knock two rooms that share a wall through into one (see lib/mergeRooms.ts), as one undo step.
   * The kept room ("a" or "b") survives and is selected.
   */
  knockThrough: (k: VariantKey, floorId: string, aId: string, bId: string, keep: "a" | "b") => MergeResult;
  updateModel: (k: VariantKey, patch: Partial<HouseModel>) => void;
  /** Set (or clear) a variant's plot; the active variant's when `k` is left out. */
  setSite: (site: Site | undefined, k?: VariantKey) => void;
  /** Edit a variant's plot (the active one's by default). Proposed borrowing As listed's gets its own copy first. */
  updateSite: (patch: Partial<Site> | ((s: Site) => Site), k?: VariantKey) => void;
  /** Add a piece of the owner's furniture; returns its id. */
  addPiece: (p: Omit<MyPiece, "id">) => string;
  /** Edit a piece; every placement in both layouts follows, as one undo step. */
  updatePiece: (id: string, patch: Partial<Omit<MyPiece, "id">>) => void;
  /** Delete a piece; its placements stay as plain items. */
  removePiece: (id: string) => void;
  setUi: (
    p: Partial<
      Pick<
        State,
        | "activeVariant"
        | "tab"
        | "editFloorId"
        | "viewMode"
        | "selectedRoomId"
        | "hoveredRoomId"
        | "selectedEdge"
        | "floorBeforeSite"
        | "gardenSel"
        | "linkSwitchId"
        | "linkGang"
        | "showLabels"
        | "showCeilings"
        | "doorsOpen"
        | "planImage"
        | "planWalls"
        | "maxLevel"
        | "sectionHeight"
        | "showExterior"
        | "showSite"
        | "measureTool"
        | "rendering"
      >
    >,
  ) => void;
  reset: () => void;
}

type Persisted = Pick<State, "variants" | "sites" | "pieces" | "settings" | "sun" | "costRates" | "savedViews" | "doorsOpen" | "planImage" | "planWalls" | "mode" | "tab" | "editFloorId" | "viewMode" | "modeBeforeReview">;

const HISTORY_LIMIT = 60;
/** Edits closer together than this (drags, typing) collapse into one undo step. */
const COALESCE_MS = 700;
let lastPush = 0;
let held = false;
let heldPushed = false;

/** While on, a whole gesture (a drag) makes one undo step: the first model change pushes a snapshot, later ones don't. Turning it off lets the next edit push. */
export function holdUndo(on: boolean) {
  held = on;
  heldPushed = false;
  if (!on) lastPush = 0;
}

/**
 * Run `fn` as one undo step: push a snapshot now, then let every setter inside record nothing more.
 * Use it for actions that make several store changes (loading a layout, applying a review).
 */
export function transact(fn: () => void) {
  const st = useStore.getState();
  const wasHeld = held;
  const wasPushed = heldPushed;
  const past = [...st.past, { variants: st.variants, sites: st.sites, pieces: st.pieces }].slice(-HISTORY_LIMIT);
  useStore.setState({ past, future: [] });
  lastPush = Date.now();
  held = true;
  heldPushed = true;
  try {
    fn();
  } finally {
    held = wasHeld;
    heldPushed = wasPushed;
  }
}

/** Forget all undo and redo steps (after a load from the server, so Ctrl+Z cannot cross it). */
export function clearHistory() {
  lastPush = 0;
  useStore.setState({ past: [], future: [] });
}


/** Load the saved project again (another tab saved newer work); set once the store exists. */
let reloadSaved: () => Promise<void> | void = () => {};

export const useStore = create<State>()(
  persist(
    (rawSet, get) => {
      /** Apply a model/site mutation, recording an undo step first. */
      const setState: typeof rawSet = (partial) => {
        const st = get();
        const patch = typeof partial === "function" ? partial(st) : partial;
        const touches = "variants" in patch || "sites" in patch || "pieces" in patch;
        if (touches) {
          const now = Date.now();
          const snap: Snapshot = { variants: st.variants, sites: st.sites, pieces: st.pieces };
          const coalesce = held ? heldPushed && st.past.length > 0 : now - lastPush < COALESCE_MS && st.past.length > 0;
          const past = coalesce ? st.past : [...st.past, snap].slice(-HISTORY_LIMIT);
          lastPush = now;
          if (held) heldPushed = true;
          rawSet({ ...patch, past, future: [] });
        } else rawSet(patch);
      };
      const snapshot = (st: State): Snapshot => ({ variants: st.variants, sites: st.sites, pieces: st.pieces });
      return {
        variants: {},
        sites: {},
        pieces: [],
        settings: { quality: "high" },
        sun: { enabled: false, dayOfYear: 172, hour: 15 },
        costRates: {},
        savedViews: [],
        past: [],
        future: [],
        undo: () => {
          const st = get();
          const prev = st.past[st.past.length - 1];
          if (!prev) return;
          lastPush = 0;
          rawSet({
            ...prev,
            past: st.past.slice(0, -1),
            future: [snapshot(st), ...st.future].slice(0, HISTORY_LIMIT),
            selectedRoomId: null,
            selectedEdge: null,
            hoveredRoomId: null,
          });
        },
        redo: () => {
          const st = get();
          const next = st.future[0];
          if (!next) return;
          lastPush = 0;
          rawSet({
            ...next,
            past: [...st.past, snapshot(st)].slice(-HISTORY_LIMIT),
            future: st.future.slice(1),
            selectedRoomId: null,
            selectedEdge: null,
            hoveredRoomId: null,
          });
        },

        mode: "build",
        gardenSel: [],
        linkSwitchId: null,
        linkGang: 0,
        selectedEdge: null,
        floorBeforeSite: null,
        setMode: (m) =>
          rawSet((st) => ({
            ...modeSwitchPatch(st, m),
            ...(m === "review" && st.mode !== "review" ? { modeBeforeReview: st.mode } : {}),
          })),
        modeBeforeReview: null,
        leaveReview: () => {
          get().setMode(get().modeBeforeReview ?? "build");
          rawSet({ modeBeforeReview: null });
        },
        hoveredRoomId: null,
        peek: false,
        peekReturn: null,
        setPeek: (on) => rawSet((st) => peekPatch(st, on)),
        activeVariant: "current",
        tab: "3d",
        editFloorId: null,
        viewMode: "single",
        selectedRoomId: null,
        showLabels: false,
        showCeilings: false,
        doorsOpen: false,
        planImage: { show: true, opacity: 0.3 },
        planWalls: true,
        maxLevel: null,
        sectionHeight: null,
        showExterior: true,
        showSite: true,
        measureTool: false,
        rendering: null,

        setSettings: (s) => rawSet((st) => ({ settings: { ...st.settings, ...s } })),
        setSun: (s) => rawSet((st) => ({ sun: { ...st.sun, ...s } })),
        setCostRates: (r) => rawSet({ costRates: r }),
        addSavedView: (v) => rawSet((st) => ({ savedViews: [...st.savedViews, v] })),
        updateSavedView: (id, patch) => rawSet((st) => ({ savedViews: st.savedViews.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
        removeSavedView: (id) => rawSet((st) => ({ savedViews: st.savedViews.filter((v) => v.id !== id) })),
        setVariant: (k, m) =>
          setState((st) => {
            const variants = { ...st.variants };
            if (m) variants[k] = m;
            else delete variants[k];
            return { variants };
          }),
        copyVariant: (from, to) =>
          setState((st) => {
            const m = st.variants[from];
            if (!m) return {};
            // Same ids on both sides let the report pair rooms up across variants.
            const copy: HouseModel = structuredClone(m);
            // A copy of a built-in house is the owner's design, not a built-in, but remembers which version it started from.
            if (copy.preset) copy.basedOn = { ...copy.preset };
            delete copy.preset;
            // The listing's printed area describes As listed, not a layout made from it.
            if (to !== "current") delete copy.listedArea;
            // The copy starts on the same plot, which it can then change on its own.
            return { variants: { ...st.variants, [to]: copy }, sites: copySiteOf(st.sites, from, to) };
          }),
        updateModel: (k, patch) =>
          setState((st) => {
            const m = st.variants[k];
            if (!m) return {};
            return { variants: { ...st.variants, [k]: { ...m, ...patch } } };
          }),
        knockThrough: (k, floorId, aId, bId, keep) => {
          const st = get();
          const floor = st.variants[k]?.floors.find((f) => f.id === floorId);
          if (!floor) return { ok: false, code: "unknown-room", reason: "That floor is gone." };
          const res = mergeRooms(floor, aId, bId, keep);
          if (!res.ok) return res;
          setState((s) => {
            const m = s.variants[k];
            if (!m) return {};
            const floors = m.floors.map((f) => (f.id === floorId ? res.floor : f));
            return { variants: { ...s.variants, [k]: { ...m, floors } }, selectedRoomId: res.room.id };
          });
          return res;
        },
        updateFloor: (k, floorId, patch) =>
          setState((st) => {
            const m = st.variants[k];
            if (!m) return {};
            const floors = m.floors.map((f) => (f.id === floorId ? (typeof patch === "function" ? patch(f) : { ...f, ...patch }) : f));
            return { variants: { ...st.variants, [k]: { ...m, floors } } };
          }),
        updateRoom: (k, floorId, roomId, patch) =>
          setState((st) => {
            const m = st.variants[k];
            if (!m) return {};
            const { floorFrom, wallsFrom, ...rest } = patch;
            let floors = m.floors.map((f) =>
              f.id === floorId ? { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, ...rest } : r)) } : f,
            );
            if ("floorFrom" in patch) floors = setLink(floors, floorId, roomId, "floor", floorFrom);
            if ("wallsFrom" in patch) floors = setLink(floors, floorId, roomId, "walls", wallsFrom);
            floors = syncLinks(floors, roomId);
            return { variants: { ...st.variants, [k]: { ...m, floors } } };
          }),
        setSite: (site, k) => setState((st) => ({ sites: setSiteOf(st.sites, k ?? st.activeVariant, site) })),
        updateSite: (patch, k) =>
          setState((st) => {
            const sites = updateSiteOf(st.sites, k ?? st.activeVariant, patch);
            return sites === st.sites ? {} : { sites };
          }),
        addPiece: (p) => {
          const id = `piece-${Math.random().toString(36).slice(2, 10)}`;
          setState((st) => ({ pieces: [...st.pieces, { ...p, id }] }));
          return id;
        },
        updatePiece: (id, patch) =>
          setState((st) => {
            const prev = st.pieces.find((x) => x.id === id);
            if (!prev) return {};
            const next = { ...prev, ...patch };
            const variants = { ...st.variants };
            for (const k of ["current", "proposed"] as VariantKey[]) {
              const m = variants[k];
              if (m) variants[k] = applyPiece(m, prev, next);
            }
            return { pieces: st.pieces.map((x) => (x.id === id ? next : x)), variants };
          }),
        removePiece: (id) =>
          setState((st) => {
            const variants = { ...st.variants };
            for (const k of ["current", "proposed"] as VariantKey[]) {
              const m = variants[k];
              if (m) variants[k] = unlinkPiece(m, id);
            }
            return { pieces: st.pieces.filter((x) => x.id !== id), variants };
          }),
        setUi: (p) =>
          rawSet((st) => {
            const q = p.tab && p.tab !== "3d" ? { ...p, measureTool: false } : p;
            return "selectedRoomId" in q && !("selectedEdge" in q) && q.selectedRoomId !== st.selectedRoomId ? { ...q, selectedEdge: null } : q;
          }),
        reset: () => setState({ variants: {}, sites: {}, savedViews: [], hoveredRoomId: null, selectedRoomId: null, selectedEdge: null, gardenSel: [], linkSwitchId: null, linkGang: 0 }),
      };
    },
    {
      // Per house: the default house keeps the old names, so existing saves keep working.
      name: houseKey("house-modeler"),
      storage: imageAwareStorage<Persisted>(undefined, undefined, { onTakeover: () => reloadSaved(), suffix: storageSuffix(activeHouseId()) }),
      partialize: (s): Persisted => ({
        variants: s.variants,
        sites: s.sites,
        pieces: s.pieces,
        settings: s.settings,
        sun: s.sun,
        costRates: s.costRates,
        savedViews: s.savedViews,
        doorsOpen: s.doorsOpen,
        planImage: s.planImage,
        planWalls: s.planWalls,
        mode: s.mode,
        tab: s.tab,
        editFloorId: s.editFloorId,
        viewMode: s.viewMode,
        modeBeforeReview: s.modeBeforeReview,
      }),
      version: PERSIST_VERSION,
      onRehydrateStorage: () => (_state, error) => {
        if (error) useHydration.setState({ error });
      },
      migrate: (persisted, version) => migratePersisted(persisted, version) as unknown as Persisted,
      // Older saves lack the newer persisted fields; keep the defaults for those.
      merge: (persisted, current) => {
        const merged = { ...current, ...((persisted ?? {}) as Partial<Persisted>) };
        // Drop a project part of the wrong basic shape rather than hand it to the renderers.
        const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
        if (!isObj(merged.variants)) merged.variants = {};
        if (!isObj(merged.sites)) merged.sites = {};
        // Saves from before photos were removed: never let the old field into the state.
        delete (merged as { photos?: unknown }).photos;
        for (const k of Object.keys(merged.variants) as VariantKey[]) {
          const m = merged.variants[k] as { floors?: unknown } | undefined;
          if (!m || !Array.isArray(m.floors)) delete merged.variants[k];
        }
        if (!Array.isArray(merged.pieces)) merged.pieces = [];
        if (!Array.isArray(merged.savedViews)) merged.savedViews = [];
        if (!isMode(merged.mode)) merged.mode = "build";
        if (!VIEW_MODES.includes(merged.viewMode)) merged.viewMode = "single";
        if (merged.tab !== "3d" && merged.tab !== "plan") merged.tab = "3d";
        if (merged.editFloorId === SITE_EDIT_ID && !editsSite(merged.mode)) merged.editFloorId = null;
        if (merged.editFloorId !== null && typeof merged.editFloorId !== "string") merged.editFloorId = null;
        if (!isMode(merged.modeBeforeReview) || merged.modeBeforeReview === "review") merged.modeBeforeReview = null;
        return merged;
      },
    },
  ),
);

export const useModel = (k?: VariantKey) => useStore((s) => s.variants[k ?? s.activeVariant]);
/** The plot variant `k` (default: the active one) shows: its own, or As listed's while Proposed has none. */
export const useSite = (k?: VariantKey) => useStore((s) => siteOf(s.sites, k ?? s.activeVariant));

reloadSaved = () => useStore.persist.rehydrate();
