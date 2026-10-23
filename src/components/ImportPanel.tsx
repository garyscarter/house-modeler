import { useMemo } from "react";
import { ask } from "./Dialogs";
import { openListingReview } from "./ListingUpdatesDialog";
import { useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { LISTING_PRESET, PRESETS } from "../lib/houses/listing91770873";
import { isListingDesign, loadListing, planListingReview, updatePreset } from "../lib/presetActions";

const DOOR_KINDS = new Set(["door", "front", "garage", "patio", "french", "bifold", "archway", "gap"]);
const WINDOW_KINDS = new Set(["window", "bay"]);

export function ImportPanel({ variant }: { variant: VariantKey }) {
  const model = useStore((s) => s.variants[variant]);
  const setVariant = useStore((s) => s.setVariant);
  const setUi = useStore((s) => s.setUi);
  const copyVariant = useStore((s) => s.copyVariant);
  const hasCurrent = useStore((s) => !!s.variants.current);
  const ownSite = useStore((s) => s.sites[variant]);
  const listedSite = useStore((s) => s.sites.current);
  // A design of the owner's started from the listing: its updates are reviewed, never replaced wholesale.
  const design = variant === "proposed" && isListingDesign(model);
  const counts = useMemo(() => {
    const review = design ? planListingReview(variant) : undefined;
    const all = review ? [...review.changes, ...(review.plot?.changes ?? [])].filter((c) => c.available) : [];
    return { all: all.length, suggested: all.filter((c) => c.defaultSelected).length };
    // The review reads the store; these are what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, model, ownSite, listedSite, variant]);

  return (
    <div className="panel">
      <h3>{VARIANT_LABEL[variant]} floorplan</h3>
      <p className="muted">
        {variant === "current"
          ? "The listing as marketed, traced from its floorplan. Load it to see it in 3D, then check the plan against the original."
          : "Your redesign, to compare against As listed. Start from a copy of As listed or load the listing with its two-storey side extension."}
      </p>
      {model?.preset && !(variant === "proposed" && model.preset.id === LISTING_PRESET.id) && PRESETS[model.preset.id] && PRESETS[model.preset.id].version > model.preset.version && (
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
      {design && (
        <div className="row">
          <button
            title="Pick changes made to the built-in house since your design was copied from it (roof, radiators, stairs, neighbours…) and bring them in without losing your edits"
            onClick={() => void openListingReview(variant)}
          >
            Bring in updates from listing 91770873…
          </button>
          <span className="muted">{counts.all ? `${counts.all} available, ${counts.suggested} suggested` : "up to date"}</span>
        </div>
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
