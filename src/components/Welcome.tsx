import { useMemo, useState } from "react";
import { useStore } from "../store";
import {
  LISTING_PRESET,
  LISTING_PROPOSED_PRESET,
  PRESETS,
} from "../lib/houses/listing91770873";
import { loadListing } from "../lib/presetActions";
import { roomWorldPolygon } from "../lib/geometry";
import { fitTransform, pathFor } from "../lib/footprint";
import { modelArea } from "../lib/report";
import type { HouseModel } from "../types";
import { BrandMark } from "./BrandMark";
import { Loader } from "./Loader";
import { openLayouts } from "./LayoutsDialog";
import "./Welcome.css";

const W = 240;
const H = 160;
/** How far the first floor is drawn behind the ground floor, in picture pixels. */
const SHIFT = 9;

type Tile = {
  key: "current" | "proposed";
  title: string;
  caption: (area: number) => string;
};
const TILES: Tile[] = [
  {
    key: "current",
    title: "The house as listed",
    caption: (a) => `2 floors · ${a} m²`,
  },
  {
    key: "proposed",
    title: "With the planned extension",
    caption: (a) => `Adds a first floor over the side extension · ${a} m²`,
  },
];

const presetModel = (id: string): HouseModel => PRESETS[id].build("");

/** A small footprint: the ground floor in outline, the first floor faintly offset behind it, extension rooms tinted. */
function Footprint({ model }: { model: HouseModel }) {
  const drawn = useMemo(() => {
    const floors = [...model.floors].sort((a, b) => a.level - b.level);
    const layers = floors.map((f) =>
      f.rooms.map((r) => ({
        poly: roomWorldPolygon(f, r),
        extension: r.roofGroup === "extension",
      })),
    );
    const shift = floors.length > 1 ? SHIFT : 0;
    const t = fitTransform(
      layers.flat().map((r) => r.poly),
      W,
      H,
      14,
      shift,
    );
    // The ground floor sits in front, nudged down and right; the floors above are drawn faintly behind it.
    const upper = layers
      .slice(1)
      .flat()
      .map((r) => pathFor(r.poly, t));
    const ground = (layers[0] ?? []).map((r) =>
      pathFor(r.poly, t, shift, shift),
    );
    // Rooms of the extension are tinted on top, wherever they sit.
    const ext = layers
      .flat()
      .filter((r) => r.extension)
      .map((r) => pathFor(r.poly, t, shift, shift));
    return { upper, ground, ext };
  }, [model]);
  return (
    <svg
      className="welcome-plan"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      focusable="false"
    >
      <g className="wp-upper">
        {drawn.upper.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="wp-ground">
        {drawn.ground.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="wp-ext">
        {drawn.ext.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** The empty state: shown whenever no layout exists. Two picture tiles load the listing's plans. */
export function Welcome() {
  const [busy, setBusy] = useState<Tile["key"] | null>(null);
  const models = useMemo(
    () => ({
      current: presetModel(LISTING_PRESET.id),
      proposed: presetModel(LISTING_PROPOSED_PRESET.id),
    }),
    [],
  );
  const areas = useMemo(
    () => ({
      current: Math.round(modelArea(models.current)),
      proposed: Math.round(modelArea(models.proposed)),
    }),
    [models],
  );

  const start = async (key: Tile["key"]) => {
    if (busy) return;
    setBusy(key);
    try {
      await loadListing("current");
      if (key === "proposed") await loadListing("proposed");
      useStore.getState().setUi({ activeVariant: "current", tab: "3d" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-card">
        <BrandMark outline size={72} />
        <h1 id="welcome-title">Listing 91770873</h1>
        <p className="welcome-lede">
          See the house in 3D, then plan what you'd change.
        </p>
        <div className="welcome-tiles">
          {TILES.map((t) => (
            <button
              key={t.key}
              className="welcome-tile"
              onClick={() => void start(t.key)}
              disabled={!!busy}
              aria-busy={busy === t.key}
            >
              <span className="welcome-pic">
                <Footprint model={models[t.key]} />
                {busy === t.key && (
                  <span className="welcome-busy" role="status">
                    <Loader kind="lift" size={20} />
                    Opening
                  </span>
                )}
              </span>
              <span className="welcome-title">{t.title}</span>
              <span className="welcome-caption">{t.caption(areas[t.key])}</span>
            </button>
          ))}
        </div>
        <button className="link welcome-import" onClick={openLayouts}>
          Open layouts…
        </button>
      </div>
    </section>
  );
}
