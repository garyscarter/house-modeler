import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Floor, HouseModel, MyPiece, Photo, Room, SavedView, Site, VariantKey } from "./types";
import { applyPiece, unlinkPiece } from "./lib/myFurniture";
import { imageAwareStorage } from "./lib/persist";
import { renamePhotos } from "./lib/modelOps";
import { mergeRooms, type MergeResult } from "./lib/mergeRooms";
import { migratePersisted, PERSIST_VERSION } from "./lib/migrate";
import { copySiteOf, setSiteOf, siteOf, updateSiteOf, type Sites } from "./lib/sites";
import { isMode, modeSwitchPatch, SITE_EDIT_ID, type Mode } from "./lib/modes";
import type { EdgePick } from "./lib/decorPick";
import { peekPatch } from "./lib/studio";

export type ViewMode = "single" | "side-by-side" | "overlay" | "wipe";
const VIEW_MODES: ViewMode[] = ["single", "side-by-side", "overlay", "wipe"];
export type Tab = "3d" | "plan";
/** editFloorId value that opens the site editor instead of a floor. */
export { SITE_EDIT_ID };

export interface Settings {
  /** Rendering quality: "high" adds ambient occlusion and soft shadows. */
  quality: "high" | "balanced" | "low";
}

/** Sun study controls. */
export interface SunState {
  /** Drive the main light from the real sun position for the site. */
  enabled: boolean;
  /** Day of the year, 1-366. */
  dayOfYear: number;
  /** Local clock time in hours (e.g. 14.5 = 2:30 pm), UK time incl. BST. */
  hour: number;
}

interface Snapshot {
  variants: Partial<Record<VariantKey, HouseModel>>;
  photos: Photo[];
  sites: Sites;
  pieces: MyPiece[];
}

interface State {
  variants: Partial<Record<VariantKey, HouseModel>>;
  photos: Photo[];
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
  /** What the person is doing: Build, Decorate, Furnish, Plot or Review. Persisted per browser, not synced, no undo. */
  mode: Mode;
  /** Decorate: the wall face picked on the selected room (null = the room's floor). */
  selectedEdge: EdgePick | null;
  /** The floor the plan showed before Plot opened the site editor, so leaving Plot goes back to it. */
  floorBeforeSite: string | null;
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
  selectedPhotoId: string | null;
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
  /** Draw roofs, canopies and exterior photo pins. */
  showExterior: boolean;
  /** Draw the plot, garden and neighbouring buildings. */
  showSite: boolean;

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
   * The kept room ("a" or "b") survives and is selected; photos of the other room follow it.
   */
  knockThrough: (k: VariantKey, floorId: string, aId: string, bId: string, keep: "a" | "b") => MergeResult;
  updateModel: (k: VariantKey, patch: Partial<HouseModel>) => void;
  /** Set (or clear) a variant's plot; the active variant's when `k` is left out. */
  setSite: (site: Site | undefined, k?: VariantKey) => void;
  /** Edit a variant's plot (the active one's by default). Proposed borrowing As listed's gets its own copy first. */
  updateSite: (patch: Partial<Site> | ((s: Site) => Site), k?: VariantKey) => void;
  addPhotos: (p: Photo[]) => void;
  updatePhoto: (id: string, patch: Partial<Photo>) => void;
  removePhoto: (id: string) => void;
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
        | "selectedPhotoId"
        | "showLabels"
        | "showCeilings"
        | "doorsOpen"
        | "planImage"
        | "planWalls"
        | "maxLevel"
        | "showExterior"
        | "showSite"
      >
    >,
  ) => void;
  reset: () => void;
}

type Persisted = Pick<State, "variants" | "photos" | "sites" | "pieces" | "settings" | "sun" | "costRates" | "savedViews" | "doorsOpen" | "planImage" | "planWalls" | "mode" | "tab" | "editFloorId" | "viewMode" | "modeBeforeReview">;

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

/** The variant photos are matched against (rooms are named from it). */
const photoSource = (variants: State["variants"]): VariantKey | undefined =>
  variants.current ? "current" : variants.proposed ? "proposed" : undefined;


export const useStore = create<State>()(
  persist(
    (rawSet, get) => {
      /** Apply a model/photo/site mutation, recording an undo step first. */
      const setState: typeof rawSet = (partial) => {
        const st = get();
        const patch = typeof partial === "function" ? partial(st) : partial;
        const touches = "variants" in patch || "photos" in patch || "sites" in patch || "pieces" in patch;
        if (touches) {
          const now = Date.now();
          const snap: Snapshot = { variants: st.variants, photos: st.photos, sites: st.sites, pieces: st.pieces };
          const coalesce = held ? heldPushed && st.past.length > 0 : now - lastPush < COALESCE_MS && st.past.length > 0;
          const past = coalesce ? st.past : [...st.past, snap].slice(-HISTORY_LIMIT);
          lastPush = now;
          if (held) heldPushed = true;
          rawSet({ ...patch, past, future: [] });
        } else rawSet(patch);
      };
      const snapshot = (st: State): Snapshot => ({ variants: st.variants, photos: st.photos, sites: st.sites, pieces: st.pieces });
      return {
        variants: {},
        photos: [],
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
        selectedPhotoId: null,
        showLabels: true,
        showCeilings: false,
        doorsOpen: false,
        planImage: { show: true, opacity: 0.3 },
        planWalls: true,
        maxLevel: null,
        showExterior: true,
        showSite: true,

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
            // Photos of the room that went follow the merged room, unless a third room shares either name.
            const clash = res.floor.rooms.some((r) => r.id !== res.room.id && (r.name === res.removed.name || r.name === res.room.name));
            const photos =
              photoSource(s.variants) === k && !clash && res.removed.name !== res.room.name
                ? renamePhotos(s.photos, floor.name, { room: res.removed.name }, { room: res.room.name })
                : s.photos;
            return { variants: { ...s.variants, [k]: { ...m, floors } }, ...(photos !== s.photos ? { photos } : {}), selectedRoomId: res.room.id };
          });
          return res;
        },
        updateFloor: (k, floorId, patch) =>
          setState((st) => {
            const m = st.variants[k];
            if (!m) return {};
            const old = m.floors.find((f) => f.id === floorId);
            const floors = m.floors.map((f) => (f.id === floorId ? (typeof patch === "function" ? patch(f) : { ...f, ...patch }) : f));
            const renamed = floors.find((f) => f.id === floorId);
            let photos = st.photos;
            // Photos follow a renamed floor, unless another floor shares either name (that would mix two floors' photos).
            const shared = (name: string) => m.floors.some((f) => f.id !== floorId && f.name === name);
            if (old && renamed && old.name !== renamed.name && photoSource(st.variants) === k && !shared(old.name) && !shared(renamed.name)) {
              photos = renamePhotos(photos, old.name, { floor: old.name }, { floor: renamed.name });
            }
            return { variants: { ...st.variants, [k]: { ...m, floors } }, ...(photos !== st.photos ? { photos } : {}) };
          }),
        updateRoom: (k, floorId, roomId, patch) =>
          setState((st) => {
            const m = st.variants[k];
            if (!m) return {};
            const floor = m.floors.find((f) => f.id === floorId);
            const old = floor?.rooms.find((r) => r.id === roomId);
            const floors = m.floors.map((f) =>
              f.id === floorId ? { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) } : f,
            );
            let photos = st.photos;
            if (
              floor &&
              old &&
              patch.name !== undefined &&
              patch.name !== old.name &&
              photoSource(st.variants) === k &&
              // Only move photos when no other room on the floor has the old or the new name (that would mix two rooms' photos).
              !floor.rooms.some((r) => r.id !== roomId && (r.name === old.name || r.name === patch.name))
            ) {
              photos = renamePhotos(photos, floor.name, { room: old.name }, { room: patch.name });
            }
            return { variants: { ...st.variants, [k]: { ...m, floors } }, ...(photos !== st.photos ? { photos } : {}) };
          }),
        setSite: (site, k) => setState((st) => ({ sites: setSiteOf(st.sites, k ?? st.activeVariant, site) })),
        updateSite: (patch, k) =>
          setState((st) => {
            const sites = updateSiteOf(st.sites, k ?? st.activeVariant, patch);
            return sites === st.sites ? {} : { sites };
          }),
        addPhotos: (p) => setState((st) => ({ photos: [...st.photos, ...p] })),
        updatePhoto: (id, patch) => setState((st) => ({ photos: st.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        removePhoto: (id) => setState((st) => ({ photos: st.photos.filter((p) => p.id !== id) })),
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
          rawSet((st) =>
            "selectedRoomId" in p && !("selectedEdge" in p) && p.selectedRoomId !== st.selectedRoomId ? { ...p, selectedEdge: null } : p,
          ),
        reset: () => setState({ variants: {}, photos: [], sites: {}, savedViews: [], hoveredRoomId: null, selectedRoomId: null, selectedEdge: null, selectedPhotoId: null }),
      };
    },
    {
      name: "house-modeler",
      storage: imageAwareStorage<Persisted>(),
      partialize: (s): Persisted => ({
        variants: s.variants,
        photos: s.photos,
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
      migrate: (persisted, version) => migratePersisted(persisted, version) as unknown as Persisted,
      // Older saves lack the newer persisted fields; keep the defaults for those.
      merge: (persisted, current) => {
        const merged = { ...current, ...((persisted ?? {}) as Partial<Persisted>) };
        if (!Array.isArray(merged.pieces)) merged.pieces = [];
        if (!Array.isArray(merged.savedViews)) merged.savedViews = [];
        if (!isMode(merged.mode)) merged.mode = "build";
        if (!VIEW_MODES.includes(merged.viewMode)) merged.viewMode = "single";
        if (merged.tab !== "3d" && merged.tab !== "plan") merged.tab = "3d";
        if (merged.editFloorId === SITE_EDIT_ID && merged.mode !== "plot") merged.editFloorId = null;
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
