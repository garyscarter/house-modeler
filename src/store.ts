import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Floor, HouseModel, Opening, Photo, Room, Site, VariantKey } from "./types";
import { imageAwareStorage } from "./lib/persist";
import { renamePhotos, scaleFloor } from "./lib/modelOps";
import { DEFAULT_MODEL, MODELS } from "./ai/models";
import { listingSite, LISTING_PRESET, LISTING_PROPOSED_PRESET } from "./lib/houses/listing91770873";

export type ViewMode = "single" | "side-by-side" | "overlay";
export type CameraMode = "orbit" | "walk";
export type Tab = "3d" | "plan";
/** editFloorId value that opens the site editor instead of a floor. */
export const SITE_EDIT_ID = "site";

export interface Settings {
  apiKey: string;
  model: string;
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
  site: Site | undefined;
}

interface State {
  variants: Partial<Record<VariantKey, HouseModel>>;
  photos: Photo[];
  /** Plot, neighbours and orientation, shared by both variants. */
  site: Site | undefined;
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
  cameraMode: CameraMode;
  walkFloorId: string | null;
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
  /** Swap the floorplan image behind every floor, scaling geometry to the new pixel size. */
  replaceImage: (k: VariantKey, image: string, w: number, h: number) => void;
  setSite: (site: Site | undefined) => void;
  updateSite: (patch: Partial<Site> | ((s: Site) => Site)) => void;
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
        | "cameraMode"
        | "walkFloorId"
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

type Persisted = Pick<State, "variants" | "photos" | "site" | "settings" | "sun" | "costRates">;

const HISTORY_LIMIT = 60;
/** Edits closer together than this (drags, typing) collapse into one undo step. */
const COALESCE_MS = 700;
let lastPush = 0;

/** The variant photos are matched against (rooms are named from it). */
const photoSource = (variants: State["variants"]): VariantKey | undefined =>
  variants.current ? "current" : variants.proposed ? "proposed" : undefined;

const isListing = (m?: HouseModel) => m?.preset?.id === LISTING_PRESET.id || m?.preset?.id === LISTING_PROPOSED_PRESET.id;

export const useStore = create<State>()(
  persist(
    (rawSet, get) => {
      /** Apply a model/photo/site mutation, recording an undo step first. */
      const setState: typeof rawSet = (partial) => {
        const st = get();
        const patch = typeof partial === "function" ? partial(st) : partial;
        const touches = "variants" in patch || "photos" in patch || "site" in patch;
        if (touches) {
          const now = Date.now();
          const snap: Snapshot = { variants: st.variants, photos: st.photos, site: st.site };
          const past = now - lastPush < COALESCE_MS && st.past.length ? st.past : [...st.past, snap].slice(-HISTORY_LIMIT);
          lastPush = now;
          rawSet({ ...patch, past, future: [] });
        } else rawSet(patch);
      };
      const snapshot = (st: State): Snapshot => ({ variants: st.variants, photos: st.photos, site: st.site });
      return {
        variants: {},
        photos: [],
        site: undefined,
        settings: { apiKey: "", model: DEFAULT_MODEL, quality: "high" },
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
        cameraMode: "orbit",
        walkFloorId: null,
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
            return { variants: { ...st.variants, [to]: copy } };
          }),
        updateModel: (k, patch) =>
          setState((st) => {
            const m = st.variants[k];
            if (!m) return {};
            return { variants: { ...st.variants, [k]: { ...m, ...patch } } };
          }),
        replaceImage: (k, image, w, h) =>
          setState((st) => {
            const m = st.variants[k];
            if (!m) return {};
            const floors = m.floors.map((f) => scaleFloor(f, w / f.imageW, image, w, h));
            return { variants: { ...st.variants, [k]: { ...m, floors } } };
          }),
        updateFloor: (k, floorId, patch) =>
          setState((st) => {
            const m = st.variants[k];
            if (!m) return {};
            const old = m.floors.find((f) => f.id === floorId);
            const floors = m.floors.map((f) => (f.id === floorId ? (typeof patch === "function" ? patch(f) : { ...f, ...patch }) : f));
            const renamed = floors.find((f) => f.id === floorId);
            let photos = st.photos;
            if (old && renamed && old.name !== renamed.name && photoSource(st.variants) === k) {
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
              // Only move photos when no other room on the floor still has the old name.
              !floor.rooms.some((r) => r.id !== roomId && r.name === old.name)
            ) {
              photos = renamePhotos(photos, floor.name, { room: old.name }, { room: patch.name });
            }
            return { variants: { ...st.variants, [k]: { ...m, floors } }, ...(photos !== st.photos ? { photos } : {}) };
          }),
        setSite: (site) => setState({ site }),
        updateSite: (patch) =>
          setState((st) => {
            if (!st.site) return {};
            return { site: typeof patch === "function" ? patch(st.site) : { ...st.site, ...patch } };
          }),
        addPhotos: (p) => setState((st) => ({ photos: [...st.photos, ...p] })),
        updatePhoto: (id, patch) => setState((st) => ({ photos: st.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        removePhoto: (id) => setState((st) => ({ photos: st.photos.filter((p) => p.id !== id) })),
        setUi: (p) => rawSet(p),
        reset: () => setState({ variants: {}, photos: [], site: undefined, selectedRoomId: null, selectedPhotoId: null }),
      };
    },
    {
      name: "house-modeler",
      storage: imageAwareStorage<Persisted>(),
      partialize: (s): Persisted => ({
        variants: s.variants,
        photos: s.photos,
        site: s.site,
        settings: s.settings,
        sun: s.sun,
        costRates: s.costRates,
      }),
      version: 3,
      migrate: (persisted, version) => {
        const st = persisted as Partial<Persisted> & { variants?: Record<string, HouseModel> };
        if (version < 2) {
          // v1 stored garage doors as door.style === "garage".
          for (const m of Object.values(st.variants ?? {})) {
            for (const f of m.floors) {
              for (const o of f.openings as (Opening & { style?: string })[]) {
                if (o.style === "garage") o.kind = "garage";
                delete o.style;
              }
            }
          }
        }
        if (version < 3) {
          // The built-in listing is a hipped semi joined to No. 26 on the right.
          for (const m of Object.values(st.variants ?? {})) {
            const ext = m.exterior as Partial<NonNullable<HouseModel["exterior"]>> | undefined;
            if (isListing(m) && ext && ext.roofStyle === undefined) {
              m.exterior = { ...(ext as NonNullable<HouseModel["exterior"]>), roofStyle: "hip", partyWall: "right" };
            }
          }
          if (!st.site && (isListing(st.variants?.current) || isListing(st.variants?.proposed))) st.site = listingSite();
          if (st.settings && !MODELS.some((m) => m.id === st.settings!.model)) st.settings = { ...st.settings, model: DEFAULT_MODEL };
          if (st.settings && !st.settings.quality) st.settings = { ...st.settings, quality: "high" };
        }
        return st as Persisted;
      },
      // Older saves lack the newer persisted fields; keep the defaults for those.
      merge: (persisted, current) => ({ ...current, ...((persisted ?? {}) as Partial<Persisted>) }),
    },
  ),
);

export const useModel = (k?: VariantKey) => useStore((s) => s.variants[k ?? s.activeVariant]);
