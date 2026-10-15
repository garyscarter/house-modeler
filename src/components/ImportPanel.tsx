import { ask } from "./Dialogs";
import { useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { listing91770873, listing91770873Proposed, listingSite, placeholderImage, PRESETS } from "../lib/houses/listing91770873";
import { listingFloorplan } from "../lib/houses/listingAssets";

const DOOR_KINDS = new Set(["door", "front", "garage", "patio", "french", "bifold", "gap"]);
const WINDOW_KINDS = new Set(["window", "bay"]);

export function ImportPanel({ variant }: { variant: VariantKey }) {
  const model = useStore((s) => s.variants[variant]);
  const setVariant = useStore((s) => s.setVariant);
  const setUi = useStore((s) => s.setUi);
  const copyVariant = useStore((s) => s.copyVariant);
  const hasCurrent = useStore((s) => !!s.variants.current);
  const setSite = useStore((s) => s.setSite);

  return (
    <div className="panel">
      <h3>{VARIANT_LABEL[variant]} floorplan</h3>
      <p className="muted">
        {variant === "current"
          ? "The listing as marketed, traced from its floorplan. Load it to see it in 3D, then check the plan against the original."
          : "Your redesign, to compare against As listed. Start from a copy of As listed or load the listing with its two-storey side extension."}
      </p>
      {model?.preset && PRESETS[model.preset.id] && PRESETS[model.preset.id].version > model.preset.version && (
        <p className="note">
          A newer tracing of this built-in house is available.{" "}
          <button
            onClick={() => {
              const fresh = PRESETS[model.preset!.id].build(model.floors[0]?.image ?? placeholderImage());
              // Keep the user's floorplan image if they set one at the same pixel size.
              const keepImage = model.floors[0] && model.floors[0].imageW === fresh.floors[0].imageW;
              setVariant(variant, keepImage ? fresh : PRESETS[model.preset!.id].build(placeholderImage()));
            }}
          >
            Update model
          </button>{" "}
          (replaces any edits you made to it)
        </p>
      )}
      {model && (
        <ul className="summary">
          {model.floors.map((f) => (
            <li key={f.id}>
              <b>{f.name}</b>: {f.rooms.length} rooms, {f.openings.filter((o) => DOOR_KINDS.has(o.kind)).length} doors and openings,{" "}
              {f.openings.filter((o) => WINDOW_KINDS.has(o.kind)).length} windows, {f.pxPerM.toFixed(0)} px/m
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {model && variant === "proposed" && hasCurrent && (
          <button
            title="Replace the proposed design with a fresh copy of As listed"
            onClick={async () => {
              if (await ask("Replace the Proposed model with a copy of As listed?", { ok: "Replace" })) copyVariant("current", "proposed");
            }}
          >
            Reset to a copy of As listed
          </button>
        )}
        {model && (
          <button
            className="danger"
            onClick={async () => {
              if (await ask(`Remove the ${VARIANT_LABEL[variant]} model?`, { ok: "Remove", danger: true })) setVariant(variant, undefined);
            }}
          >
            Remove
          </button>
        )}
        {!model && (
          <>
            <button
              onClick={() => {
                const build = variant === "current" ? listing91770873 : listing91770873Proposed;
                // The listing's own floorplan sits behind the tracing; fall back to a placeholder offline.
                void listingFloorplan()
                  .catch(() => placeholderImage())
                  .then((image) => {
                    setVariant(variant, build(image));
                    if (!useStore.getState().site) setSite(listingSite());
                    setUi({ activeVariant: variant });
                  });
              }}
            >
              {variant === "current" ? "Load listing 91770873" : "Load listing 91770873 with two-storey extension"}
            </button>
            {variant === "proposed" && hasCurrent && (
              <button
                title="Start the proposed design from a copy of the As listed model, then edit it in Check plan"
                onClick={() => {
                  copyVariant("current", "proposed");
                  setUi({ activeVariant: "proposed", tab: "plan", selectedRoomId: null });
                }}
              >
                Copy As listed to start
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
