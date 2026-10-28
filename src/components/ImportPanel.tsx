import { useMemo } from "react";
import { ask } from "./Dialogs";
import { openListingReview } from "./ListingUpdatesDialog";
import { useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { useCurrentHouse } from "../lib/house";
import { floorDisplayName } from "../lib/studio";
import { Info } from "./Info";
import { isListingDesign, loadBuiltIn, planListingReview, updatePreset } from "../lib/presetActions";

const DOOR_KINDS = new Set(["door", "front", "garage", "patio", "french", "bifold", "archway", "gap"]);
const WINDOW_KINDS = new Set(["window", "bay"]);

/** How many of the built-in house's updates the design in `variant` can still bring in (zero when it is not a copy of the listing). */
export function useListingUpdateCount(variant: VariantKey): { all: number; suggested: number } {
  const model = useStore((s) => s.variants[variant]);
  const ownSite = useStore((s) => s.sites[variant]);
  const listedSite = useStore((s) => s.sites.current);
  // A design of the owner's started from the listing: its updates are reviewed, never replaced wholesale.
  const design = variant === "proposed" && isListingDesign(model);
  return useMemo(() => {
    const review = design ? planListingReview(variant) : undefined;
    const all = review ? [...review.changes, ...(review.plot?.changes ?? [])].filter((c) => c.available) : [];
    return { all: all.length, suggested: all.filter((c) => c.defaultSelected).length };
    // The review reads the store; these are what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, model, ownSite, listedSite, variant]);
}

export function ImportPanel({ variant }: { variant: VariantKey }) {
  const model = useStore((s) => s.variants[variant]);
  const house = useCurrentHouse();
  const setVariant = useStore((s) => s.setVariant);
  const setUi = useStore((s) => s.setUi);
  const copyVariant = useStore((s) => s.copyVariant);
  const hasCurrent = useStore((s) => !!s.variants.current);
  const design = variant === "proposed" && isListingDesign(model);
  const counts = useListingUpdateCount(variant);

  return (
    <div className="panel">
      <h3 className="with-info">
        {VARIANT_LABEL[variant]}
        <Info>
          {variant === "current"
            ? `${house.name} as traced from its floorplan. Load it to see it in 3D, then check the plan against the original.`
            : `Your redesign, to compare against As listed. Start from a copy of As listed${house.proposed ? " or load the built-in Proposed with its two-storey side extension" : ""}.`}
        </Info>
      </h3>
      {model?.preset && !(variant === "proposed" && model.preset.id === house.main) && house.presets[model.preset.id] && house.presets[model.preset.id].version > model.preset.version && (
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
            Bring in updates from {house.name}…
          </button>
          <span className="muted">{counts.all ? `${counts.all} available, ${counts.suggested} suggested` : "up to date"}</span>
        </div>
      )}
      {model && (
        <ul className="summary">
          {model.floors.map((f) => (
            <li key={f.id}>
              <b>{floorDisplayName(f.name)}</b>: {f.rooms.length} rooms, {f.openings.filter((o) => DOOR_KINDS.has(o.kind)).length} doors and openings,{" "}
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
            {(variant === "current" || house.proposed) && (
              <button onClick={() => void loadBuiltIn(variant)}>{variant === "current" ? `Load ${house.name}` : `Load ${house.name} with the planned changes`}</button>
            )}
            {variant === "proposed" && hasCurrent && (
              <button
                title="Start the proposed design from a copy of the As listed model, then edit it in Plan"
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
