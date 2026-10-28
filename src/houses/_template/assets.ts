import type { Elevation, Photo } from "../../types";
import { uid } from "../../types";
import { placeholderImage } from "./house";

/**
 * The house's floorplan and photos, bundled from `assets/` beside this file: `assets/floorplan.(webp|png|jpg)` and
 * `assets/photos/*.jpg`. Until there is a floorplan the tracing is drawn over a placeholder. Name each photo in
 * PLACES so it opens already placed in its room or on its elevation.
 */
const FLOORPLAN = import.meta.glob<string>("./assets/floorplan.{webp,png,jpg}", { eager: true, query: "?url", import: "default" });
const PHOTO_URLS = import.meta.glob<string>("./assets/photos/*.jpg", { eager: true, query: "?url", import: "default" });

type Place = { floor: string; room: string; description: string } | { elevation: Elevation; description: string };

/** Photo name (file name without .jpg) to where it was taken. */
const PLACES: Record<string, Place> = {};

/** Fetch a bundled asset as a data URL, so it persists with the project. */
async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function houseFloorplan(): Promise<string> {
  const url = Object.values(FLOORPLAN)[0];
  return url ? toDataUrl(url) : Promise.resolve(placeholderImage());
}

export async function housePhotos(onProgress?: (done: number, total: number) => void): Promise<Photo[]> {
  const entries = Object.entries(PHOTO_URLS).sort(([a], [b]) => a.localeCompare(b));
  let done = 0;
  onProgress?.(0, entries.length);
  return Promise.all(
    entries.map(async ([path, url]) => {
      const name = path.split("/").pop()!.replace(/\.jpg$/, "");
      const place = PLACES[name];
      const photo: Photo = { id: uid(), name, dataUrl: await toDataUrl(url), description: place?.description };
      if (place && "room" in place) Object.assign(photo, { floorName: place.floor, roomName: place.room });
      else if (place) photo.elevation = place.elevation;
      onProgress?.(++done, entries.length);
      return photo;
    }),
  );
}

/** The names of the photos PLACES knows about, for the house test. */
export const PHOTO_PLACES = PLACES;
