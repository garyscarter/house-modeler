import { ask } from "./Dialogs";
import { useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { PRESETS } from "../lib/houses/listing91770873";
import { loadListing, updatePreset } from "../lib/presetActions";

const DOOR_KINDS = new Set(["door", "front", "garage", "patio", "french", "bifold", "archway", "gap"]);
const WINDOW_KINDS = new Set(["window", "bay"]);

export function ImportPanel({ variant }: { variant: VariantKey }) {
  const model = useStore((s) => s.variants[variant]);
  const setVariant = useStore((s) => s.setVariant);
  const setUi = useStore((s) => s.setUi);
  const copyVariant = useStore((s) => s.copyVariant);
  const hasCurrent = useStore((s) => !!s.variants.current);

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
            onClick={() => updatePreset(variant)}
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
              onClick={() => void loadListing(variant)}
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
