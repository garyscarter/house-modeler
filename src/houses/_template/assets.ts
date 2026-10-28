import { placeholderImage } from "./house";

/**
 * The house's floorplan, bundled from `assets/floorplan.(webp|png|jpg)` beside this file. Until there is one the
 * tracing is drawn over a placeholder. Photos are not part of the app: they go in reference/<id>/photos/ for Claude
 * and the notes.
 */
const FLOORPLAN = import.meta.glob<string>("./assets/floorplan.{webp,png,jpg}", { eager: true, query: "?url", import: "default" });

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
