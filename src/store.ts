import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { del, get, set } from "idb-keyval";
import type { Floor, HouseModel, Photo, Room, VariantKey } from "./types";

export type ViewMode = "single" | "side-by-side" | "overlay";
export type CameraMode = "orbit" | "walk";

export interface Settings {
  apiKey: string;
  model: string;
}

interface State {
  variants: Partial<Record<VariantKey, HouseModel>>;
  photos: Photo[];
  settings: Settings;

  // UI (not persisted)
  activeVariant: VariantKey;
  viewMode: ViewMode;
  cameraMode: CameraMode;
  walkFloorId: string | null;
  selectedRoomId: string | null;
  selectedPhotoId: string | null;
  showLabels: boolean;
  showCeilings: boolean;
  /** Hide floors above this level in the 3D view (null = show all). */
  maxLevel: number | null;

  setSettings: (s: Partial<Settings>) => void;
  setVariant: (k: VariantKey, m: HouseModel | undefined) => void;
  updateFloor: (k: VariantKey, floorId: string, patch: Partial<Floor> | ((f: Floor) => Floor)) => void;
  updateRoom: (k: VariantKey, floorId: string, roomId: string, patch: Partial<Room>) => void;
  updateModel: (k: VariantKey, patch: Partial<HouseModel>) => void;
  addPhotos: (p: Photo[]) => void;
  updatePhoto: (id: string, patch: Partial<Photo>) => void;
  removePhoto: (id: string) => void;
  setUi: (
    p: Partial<
      Pick<
        State,
        | "activeVariant"
        | "viewMode"
        | "cameraMode"
        | "walkFloorId"
        | "selectedRoomId"
        | "selectedPhotoId"
        | "showLabels"
        | "showCeilings"
        | "maxLevel"
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

export const useStore = create<State>()(
  persist(
    (setState) => ({
      variants: {},
      photos: [],
      settings: { apiKey: "", model: "claude-opus-5" },

      activeVariant: "current",
      viewMode: "single",
      cameraMode: "orbit",
      walkFloorId: null,
      selectedRoomId: null,
      selectedPhotoId: null,
      showLabels: true,
      showCeilings: false,
      maxLevel: null,

      setSettings: (s) => setState((st) => ({ settings: { ...st.settings, ...s } })),
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
      setUi: (p) => setState(p),
      reset: () => setState({ variants: {}, photos: [], selectedRoomId: null, selectedPhotoId: null }),
    }),
    {
      name: "house-modeler",
      storage: idbStorage,
      partialize: (s) => ({ variants: s.variants, photos: s.photos, settings: s.settings }),
    },
  ),
);

export const useModel = (k?: VariantKey) =>
  useStore((s) => s.variants[k ?? s.activeVariant]);
