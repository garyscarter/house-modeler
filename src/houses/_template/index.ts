import type { HouseDef } from "../types";
import meta from "./meta.json";
import { placeholderImage, PRESETS, SITE_PRESETS, TEMPLATE_PRESET, TEMPLATE_PROPOSED_PRESET, TEMPLATE_SITE_PRESET } from "./house";
import { houseFloorplan } from "./assets";

const house: HouseDef = {
  id: "_template",
  name: meta.name,
  presets: PRESETS,
  sitePresets: SITE_PRESETS,
  main: TEMPLATE_PRESET.id,
  proposed: TEMPLATE_PROPOSED_PRESET.id,
  site: TEMPLATE_SITE_PRESET.id,
  tiles: [
    { preset: TEMPLATE_PRESET.id, variant: "current", title: "The house as it is", caption: (a) => `2 floors · ${a} m²` },
    { preset: TEMPLATE_PROPOSED_PRESET.id, variant: "proposed", title: "With the kitchen opened up", caption: (a) => `Kitchen and dining room knocked through · ${a} m²` },
  ],
  floorplan: houseFloorplan,
  placeholderImage,
};

export default house;
