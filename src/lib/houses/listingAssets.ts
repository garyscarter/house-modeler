import type { Elevation, Photo } from "../../types";
import { uid } from "../../types";
import floorplanUrl from "../../assets/listing-91770873/floorplan.webp";

/**
 * The listing's public floorplan and photos for listing 91770873, bundled so
 * the built-in house opens with its real plan behind the tracing and its
 * photos already placed. Room assignments were made by eye from the photos;
 * fix any in the Photos panel.
 */
const PHOTO_URLS = import.meta.glob<string>("../../assets/listing-91770873/photos/*.jpg", { eager: true, query: "?url", import: "default" });

type Place = { floor: "Ground Floor" | "Floor 1"; room: string; description: string } | { elevation: Elevation; description: string };

const PLACES: Record<string, Place> = {
  "kitchen-1": { floor: "Ground Floor", room: "Kitchen", description: "Kitchen: cream shaker units, exposed brick pier, patterned vinyl floor." },
  "kitchen-2": { floor: "Ground Floor", room: "Kitchen", description: "Kitchen dining area towards the hall doors." },
  "kitchen-3": { floor: "Ground Floor", room: "Kitchen", description: "Kitchen dining table with the brick wall and rear windows." },
  "kitchen-4": { floor: "Ground Floor", room: "Kitchen", description: "Kitchen run along the rear windows." },
  // Named "galley" by the listing, but it is the front hall: the glazed door across the corridor to the kitchen on the left.
  "galley-1": { floor: "Ground Floor", room: "Hallway (front)", description: "Front hall with quarry tiles looking east to the barred side window, past the glazed corridor door and the boxed soil pipes." },
  "galley-2": { floor: "Ground Floor", room: "Kitchen (galley)", description: "Galley kitchen with cooker and fridge." },
  "living-rear-1": { floor: "Ground Floor", room: "Living Room (rear)", description: "Rear living room fireplace and the opening to the front room." },
  "living-rear-2": { floor: "Ground Floor", room: "Living Room (rear)", description: "Rear living room towards the sliding patio doors." },
  "living-rear-3": { floor: "Ground Floor", room: "Living Room (rear)", description: "Rear living room fireplace on the party wall." },
  "living-front-1": { floor: "Ground Floor", room: "Living Room (front)", description: "Front living room looking through to the rear room." },
  "living-front-2": { floor: "Ground Floor", room: "Living Room (front)", description: "Front living room towards the bay." },
  "living-front-3": { floor: "Ground Floor", room: "Living Room (front)", description: "Front living room bay window." },
  "hall-stairs-1": { floor: "Ground Floor", room: "Hallway (stairs)", description: "Stairs with a dark timber balustrade." },
  "hall-stairs-2": { floor: "Ground Floor", room: "Hallway (stairs)", description: "Foot of the stairs." },
  "hall-front-1": { floor: "Ground Floor", room: "Hallway (front)", description: "Front hall with quarry tiles towards the front door." },
  "landing-1": { floor: "Floor 1", room: "Landing", description: "Landing doors." },
  "bathroom-1": { floor: "Floor 1", room: "Bathroom", description: "Shower enclosure and vanity basin." },
  "bathroom-2": { floor: "Floor 1", room: "Bathroom", description: "Shower and window." },
  "bathroom-wc": { floor: "Floor 1", room: "Bathroom", description: "Separate WC." },
  "bedroom-1-1": { floor: "Floor 1", room: "Bedroom 1", description: "Single bedroom with fitted wardrobe." },
  "bedroom-1-2": { floor: "Floor 1", room: "Bedroom 1", description: "Single bedroom with desk." },
  "bedroom-2-1": { floor: "Floor 1", room: "Bedroom 2", description: "Double bedroom." },
  "bedroom-2-2": { floor: "Floor 1", room: "Bedroom 2", description: "Double bedroom with fitted wardrobes." },
  "bedroom-2-3": { floor: "Floor 1", room: "Bedroom 2", description: "Double bedroom fitted wardrobes." },
  "bedroom-3-1": { floor: "Floor 1", room: "Bedroom 3", description: "Front bedroom, laminate floor, lilac walls." },
  "bedroom-3-2": { floor: "Floor 1", room: "Bedroom 3", description: "Front bedroom." },
  "bedroom-3-3": { floor: "Floor 1", room: "Bedroom 3", description: "Front bedroom fitted wardrobes." },
  "front-1": { elevation: "front", description: "Front from the right: brick single-storey front, cream render above." },
  "front-2": { elevation: "front", description: "Front elevation from the street." },
  "front-3": { elevation: "front", description: "Garage, porch and front door from the drive." },
  "front-garden": { elevation: "front", description: "Front garden and low brick wall." },
  "front-street": { elevation: "front", description: "Street view with the neighbouring houses." },
  "rear-1": { elevation: "rear", description: "Rear elevation and patio." },
  "rear-2": { elevation: "rear", description: "Rear of the single-storey part with its flat roof." },
  "rear-3": { elevation: "rear", description: "Rear towards No. 26 and its conservatory." },
  "rear-4": { elevation: "rear", description: "Rear elevation from the garden." },
  "rear-garden": { elevation: "rear", description: "Rear garden looking towards the house." },
};

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

export async function listingPhotos(): Promise<Photo[]> {
  const entries = Object.entries(PHOTO_URLS).sort(([a], [b]) => a.localeCompare(b));
  return Promise.all(
    entries.map(async ([path, url]) => {
      const name = path.split("/").pop()!.replace(/\.jpg$/, "");
      const place = PLACES[name];
      const photo: Photo = { id: uid(), name, dataUrl: await toDataUrl(url), description: place?.description };
      if (place && "room" in place) Object.assign(photo, { floorName: place.floor, roomName: place.room });
      else if (place) photo.elevation = place.elevation;
      return photo;
    }),
  );
}
