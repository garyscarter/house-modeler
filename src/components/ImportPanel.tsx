import { useState } from "react";
import { useStore } from "../store";
import { extractFloorplan } from "../ai/extract";
import { describeError } from "../ai/client";
import { fileToDataUrl, imageSize } from "../lib/image";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { sampleHouse } from "../lib/sample";
import { blankFloorFromImage, emptyHouse, FLOOR_NAMES } from "../lib/manual";
import { listing91770873, listing91770873Proposed, placeholderImage } from "../lib/houses/listing91770873";

export function ImportPanel({ variant }: { variant: VariantKey }) {
  const settings = useStore((s) => s.settings);
  const model = useStore((s) => s.variants[variant]);
  const setVariant = useStore((s) => s.setVariant);
  const setUi = useStore((s) => s.setUi);
  const replaceImage = useStore((s) => s.replaceImage);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  /** No-AI path: add the image as a blank floor and open the plan editor to trace it. */
  const trace = async (file: File) => {
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const base = model ?? emptyHouse();
      const level = base.floors.length ? Math.max(...base.floors.map((f) => f.level)) + 1 : 0;
      const floor = await blankFloorFromImage(dataUrl, FLOOR_NAMES[level] ?? `Level ${level}`, level);
      setVariant(variant, { ...base, floors: [...base.floors, floor] });
      setUi({ activeVariant: variant, tab: "plan", editFloorId: floor.id, selectedRoomId: null });
    } catch (e) {
      setError(describeError(e));
    }
  };

  const run = async (file: File) => {
    setError(null);
    setNotes(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const { extraction, house } = await extractFloorplan(settings.apiKey, settings.model, dataUrl, setBusy);
      setVariant(variant, house);
      setNotes(extraction.notes);
      setUi({ activeVariant: variant, selectedRoomId: null });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel">
      <h3>{VARIANT_LABEL[variant]} floorplan</h3>
      <p className="muted">
        {variant === "current"
          ? "Upload the floorplan image from the listing. Claude reads the rooms, doors, windows and printed dimensions, then the 3D model is built and scaled automatically."
          : "Upload your redrawn floorplan (a sketch, an edited copy of the original, or a new plan). It goes through the same extraction so you can compare it against the listing."}
      </p>
      <div className="row">
        <label className={"file" + (settings.apiKey ? "" : " disabled")}>
          {busy ? busy + "…" : model ? "Replace with AI extraction" : "Extract with AI"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={!!busy || !settings.apiKey}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(f);
              e.target.value = "";
            }}
          />
        </label>
        <label className="file">
          {model ? "Add a floor to trace by hand" : "Trace by hand (no AI)"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={!!busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void trace(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {!settings.apiKey && (
        <p className="muted small">
          AI extraction needs an Anthropic API key (Settings). Without one, upload the image and trace the rooms in the plan editor:
          draw each room, add doors and windows, then set the scale.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {notes && (
        <p className="note">
          <b>Model notes:</b> {notes}
        </p>
      )}
      {model && (
        <ul className="summary">
          {model.floors.map((f) => (
            <li key={f.id}>
              <b>{f.name}</b>: {f.rooms.length} rooms, {f.openings.filter((o) => o.kind === "door").length} doors,{" "}
              {f.openings.filter((o) => o.kind === "window").length} windows, {f.pxPerM.toFixed(0)} px/m
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {model && (
          <button
            className="danger"
            onClick={() => {
              if (window.confirm(`Remove the ${VARIANT_LABEL[variant]} model?`)) setVariant(variant, undefined);
            }}
          >
            Remove
          </button>
        )}
        {model && (
          <label className="file" title="Show the real floorplan behind the traced geometry in Check plan">
            Set floorplan image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const dataUrl = await fileToDataUrl(f);
                const size = await imageSize(dataUrl);
                replaceImage(variant, dataUrl, size.w, size.h);
              }}
            />
          </label>
        )}
        {!model && (
          <>
            <button
              onClick={() => {
                const build = variant === "current" ? listing91770873 : listing91770873Proposed;
                setVariant(variant, build(placeholderImage()));
                setUi({ activeVariant: variant });
              }}
            >
              {variant === "current" ? "Load listing 91770873" : "Load listing 91770873 with two-storey extension"}
            </button>
            {variant === "current" && <button onClick={() => setVariant(variant, sampleHouse())}>Load sample house</button>}
          </>
        )}
      </div>
    </div>
  );
}
