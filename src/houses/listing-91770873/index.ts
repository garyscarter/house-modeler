import type { HouseDef } from "../types";
import meta from "./meta.json";
import { LISTING_PRESET, LISTING_PROPOSED_PRESET, LISTING_SITE_PRESET, placeholderImage, PRESETS, SITE_PRESETS } from "./house";
import { listingFloorplan, listingPhotos } from "./assets";

const house: HouseDef = {
  id: "listing-91770873",
  name: meta.name,
  presets: PRESETS,
  sitePresets: SITE_PRESETS,
  main: LISTING_PRESET.id,
  proposed: LISTING_PROPOSED_PRESET.id,
  site: LISTING_SITE_PRESET.id,
  tiles: [
    { preset: LISTING_PRESET.id, variant: "current", title: "The house as listed", caption: (a) => `2 floors · ${a} m²` },
    { preset: LISTING_PROPOSED_PRESET.id, variant: "proposed", title: "With the planned extension", caption: (a) => `Adds a first floor over the side extension · ${a} m²` },
  ],
  floorplan: listingFloorplan,
  photos: listingPhotos,
  photoMarker: "front-1",
  placeholderImage,
};

export default house;
