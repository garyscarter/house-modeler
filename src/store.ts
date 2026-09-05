import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { del, get, set } from "idb-keyval";
import type { Floor, HouseModel, Opening, Photo, Room, VariantKey } from "./types";

export type ViewMode = "single" | "side-by-side" | "overlay";
export type CameraMode = "orbit" | "walk";
export type Tab = "3d" | "plan";

export interface Settings {
  apiKey: string;
  model: string;
}

interface Snapshot {
  variants: Partial<Record<VariantKey, HouseModel>>;
  photos: Photo[];
}

interface State {
  variants: Partial<Record<VariantKey, HouseModel>>;
  photos: Photo[];
  settings: Settings;

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

  setSettings: (s: Partial<Settings>) => void;
  setVariant: (k: VariantKey, m: HouseModel | undefined) => void;
  updateFloor: (k: VariantKey, floorId: string, patch: Partial<Floor> | ((f: Floor) => Floor)) => void;
  updateRoom: (k: VariantKey, floorId: string, roomId: string, patch: Partial<Room>) => void;
  updateModel: (k: VariantKey, patch: Partial<HouseModel>) => void;
  /** Swap the floorplan image behind every floor, scaling geometry to the new pixel size. */
  replaceImage: (k: VariantKey, image: string, w: number, h: number) => void;
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
      >
    >,
  ) => void;
  reset: () => void;
}

const idbStorage = createJSONStorage(() => ({
  getItem: async (name: string) => (await get<string>(name)) ?? null,
  setItem: async (name: string, value: string) => {
    await set(name, value);
  },
  removeItem: async (name: string) => {
    await del(name);
  },
}));

const HISTORY_LIMIT = 60;
/** Edits closer together than this (drags, typing) collapse into one undo step. */
const COALESCE_MS = 700;
let lastPush = 0;

export const useStore = create<State>()(
  persist(
    (rawSet, get) => {
      /** Apply a model/photo mutation, recording an undo step first. */
      const setState: typeof rawSet = (partial) => {
        const st = get();
        const patch = typeof partial === "function" ? partial(st) : partial;
        const touches = "variants" in patch || "photos" in patch;
        if (touches) {
          const now = Date.now();
          const snap: Snapshot = { variants: st.variants, photos: st.photos };
          const past = now - lastPush < COALESCE_MS && st.past.length ? st.past : [...st.past, snap].slice(-HISTORY_LIMIT);
          lastPush = now;
          rawSet({ ...patch, past, future: [] });
        } else rawSet(patch);
      };
      return {
      variants: {},
      photos: [],
      settings: { apiKey: "", model: "claude-opus-5" },
      past: [],
      future: [],
      undo: () => {
        const st = get();
        const prev = st.past[st.past.length - 1];
        if (!prev) return;
        lastPush = 0;
        rawSet({
          variants: prev.variants,
          photos: prev.photos,
          past: st.past.slice(0, -1),
          future: [{ variants: st.variants, photos: st.photos }, ...st.future].slice(0, HISTORY_LIMIT),
          selectedRoomId: null,
        });
      },
      redo: () => {
        const st = get();
        const next = st.future[0];
        if (!next) return;
        lastPush = 0;
        rawSet({
          variants: next.variants,
          photos: next.photos,
          past: [...st.past, { variants: st.variants, photos: st.photos }].slice(-HISTORY_LIMIT),
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

      setSettings: (s) => rawSet((st) => ({ settings: { ...st.settings, ...s } })),
      setVariant: (k, m) =>
        setState((st) => {
          const variants = { ...st.variants };
          if (m) variants[k] = m;
          else delete variants[k];
          return { variants };
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
          const floors = m.floors.map((f) => {
            const s = w / f.imageW;
            const sc = (p: { x: number; y: number }) => ({ x: p.x * s, y: p.y * s });
            return {
              ...f,
              image,
              imageW: w,
              imageH: h,
              pxPerM: f.pxPerM * s,
              origin: sc(f.origin),
              rooms: f.rooms.map((r) => ({ ...r, polygon: r.polygon.map(sc) })),
              openings: f.openings.map((o) => ({ ...o, ...sc(o) })),
              stairs: f.stairs ? sc(f.stairs) : undefined,
            };
          });
          return { variants: { ...st.variants, [k]: { ...m, floors } } };
        }),
      updateFloor: (k, floorId, patch) =>
        setState((st) => {
          const m = st.variants[k];
          if (!m) return {};
          const floors = m.floors.map((f) =>
            f.id === floorId ? (typeof patch === "function" ? patch(f) : { ...f, ...patch }) : f,
          );
          return { variants: { ...st.variants, [k]: { ...m, floors } } };
        }),
      updateRoom: (k, floorId, roomId, patch) =>
        setState((st) => {
          const m = st.variants[k];
          if (!m) return {};
          const floors = m.floors.map((f) =>
            f.id === floorId
              ? { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) }
              : f,
          );
          return { variants: { ...st.variants, [k]: { ...m, floors } } };
        }),
      addPhotos: (p) => setState((st) => ({ photos: [...st.photos, ...p] })),
      updatePhoto: (id, patch) =>
        setState((st) => ({ photos: st.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removePhoto: (id) => setState((st) => ({ photos: st.photos.filter((p) => p.id !== id) })),
      setUi: (p) => rawSet(p),
      reset: () => setState({ variants: {}, photos: [], selectedRoomId: null, selectedPhotoId: null }),
      };
    },
    {
      name: "house-modeler",
      storage: idbStorage,
      partialize: (s) => ({ variants: s.variants, photos: s.photos, settings: s.settings }),
      version: 2,
      migrate: (persisted) => {
        // v1 stored garage doors as door.style === "garage".
        const st = persisted as { variants?: Record<string, HouseModel> };
        for (const m of Object.values(st.variants ?? {})) {
          for (const f of m.floors) {
            for (const o of f.openings as (Opening & { style?: string })[]) {
              if (o.style === "garage") o.kind = "garage";
              delete o.style;
            }
          }
        }
        return persisted;
      },
    },
  ),
);

export const useModel = (k?: VariantKey) =>
  useStore((s) => s.variants[k ?? s.activeVariant]);
