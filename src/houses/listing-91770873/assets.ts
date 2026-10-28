import floorplanUrl from "./assets/floorplan.webp";

/**
 * The listing's public floorplan for listing 91770873, bundled so the built-in house opens with its real plan behind
 * the tracing. The listing's photos are reference material, kept in reference/listing-91770873/photos/.
 */

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

export function listingFloorplan(): Promise<string> {
  return toDataUrl(floorplanUrl);
}
