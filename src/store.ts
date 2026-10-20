import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Floor, HouseModel, Photo, Room, Site, VariantKey } from "./types";
import { imageAwareStorage } from "./lib/persist";
import { renamePhotos } from "./lib/modelOps";
import { migratePersisted, PERSIST_VERSION } from "./lib/migrate";
import { copySiteOf, setSiteOf, siteOf, updateSiteOf, type Sites } from "./lib/sites";

export type ViewMode = "single" | "side-by-side" | "overlay";
export type Tab = "3d" | "plan";
/** editFloorId value that opens the site editor instead of a floor. */
export const SITE_EDIT_ID = "site";

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
  settings: Settings;
  sun: SunState;
  /** Cost rates for the report, keyed by line item. */
  costRates: Record<string, number>;

  /** Undo history (not persisted). */
  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;

  // UI (not persisted)
  activeVariant: VariantKey;
  tab: Tab;
  editFloorId: string | null;
  viewMode: ViewMode;
  selectedRoomId: string | null;
  selectedPhotoId: string | null;
  showLabels: boolean;
  showCeilings: boolean;
  /** Hide floors above this level in the 3D view (null = show all). */
  maxLevel: number | null;
  /** Draw roofs, canopies and exterior photo pins. */
  showExterior: boolean;
  /** Draw the plot, garden and neighbouring buildings. */
  showSite: boolean;

  setSettings: (s: Partial<Settings>) => void;
  setSun: (s: Partial<SunState>) => void;
  setCostRates: (r: Record<string, number>) => void;
  setVariant: (k: VariantKey, m: HouseModel | undefined) => void;
  /** Copy one variant over another (e.g. "As listed" to "Proposed" to start a design). */
  copyVariant: (from: VariantKey, to: VariantKey) => void;
  updateFloor: (k: VariantKey, floorId: string, patch: Partial<Floor> | ((f: Floor) => Floor)) => void;
  updateRoom: (k: VariantKey, floorId: string, roomId: string, patch: Partial<Room>) => void;
  updateModel: (k: VariantKey, patch: Partial<HouseModel>) => void;
  /** Set (or clear) a variant's plot; the active variant's when `k` is left out. */
  setSite: (site: Site | undefined, k?: VariantKey) => void;
  /** Edit a variant's plot (the active one's by default). Proposed borrowing As listed's gets its own copy first. */
  updateSite: (patch: Partial<Site> | ((s: Site) => Site), k?: VariantKey) => void;
  addPhotos: (p: Photo[]) => void;
  updatePhoto: (id: string, patch: Partial<Photo>) => void;
  removePhoto: (id: string) => void;
  setUi: (
    p: Partial<
      Pick<
        State,
        | "activeVariant"
        | "tab"
        | "editFloorId"
        | "viewMode"
        | "selectedRoomId"
        | "selectedPhotoId"
        | "showLabels"
        | "showCeilings"
        | "maxLevel"
        | "showExterior"
        | "showSite"
      >
    >,
  ) => void;
  reset: () => void;
}

type Persisted = Pick<State, "variants" | "photos" | "sites" | "settings" | "sun" | "costRates">;

const HISTORY_LIMIT = 60;
/** Edits closer together than this (drags, typing) collapse into one undo step. */
const COALESCE_MS = 700;
let lastPush = 0;

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
        const touches = "variants" in patch || "photos" in patch || "sites" in patch;
        if (touches) {
          const now = Date.now();
          const snap: Snapshot = { variants: st.variants, photos: st.photos, sites: st.sites };
          const past = now - lastPush < COALESCE_MS && st.past.length ? st.past : [...st.past, snap].slice(-HISTORY_LIMIT);
          lastPush = now;
          rawSet({ ...patch, past, future: [] });
        } else rawSet(patch);
      };
      const snapshot = (st: State): Snapshot => ({ variants: st.variants, photos: st.photos, sites: st.sites });
      return {
        variants: {},
        photos: [],
        sites: {},
        settings: { quality: "high" },
        sun: { enabled: false, dayOfYear: 172, hour: 15 },
        costRates: {},
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
          });
        },

        activeVariant: "current",
        tab: "3d",
        editFloorId: null,
        viewMode: "single",
        selectedRoomId: null,
        selectedPhotoId: null,
        showLabels: true,
        showCeilings: false,
        maxLevel: null,
        showExterior: true,
        showSite: true,

        setSettings: (s) => rawSet((st) => ({ settings: { ...st.settings, ...s } })),
        setSun: (s) => rawSet((st) => ({ sun: { ...st.sun, ...s } })),
        setCostRates: (r) => rawSet({ costRates: r }),
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
        setUi: (p) => rawSet(p),
        reset: () => setState({ variants: {}, photos: [], sites: {}, selectedRoomId: null, selectedPhotoId: null }),
      };
    },
    {
      name: "house-modeler",
      storage: imageAwareStorage<Persisted>(),
      partialize: (s): Persisted => ({
        variants: s.variants,
        photos: s.photos,
        sites: s.sites,
        settings: s.settings,
        sun: s.sun,
        costRates: s.costRates,
      }),
      version: PERSIST_VERSION,
      migrate: (persisted, version) => migratePersisted(persisted, version) as unknown as Persisted,
      // Older saves lack the newer persisted fields; keep the defaults for those.
      merge: (persisted, current) => ({ ...current, ...((persisted ?? {}) as Partial<Persisted>) }),
    },
  ),
);

export const useModel = (k?: VariantKey) => useStore((s) => s.variants[k ?? s.activeVariant]);
/** The plot variant `k` (default: the active one) shows: its own, or As listed's while Proposed has none. */
export const useSite = (k?: VariantKey) => useStore((s) => siteOf(s.sites, k ?? s.activeVariant));
