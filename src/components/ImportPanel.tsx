import { useState } from "react";
import { useStore } from "../store";
import { extractFloorplan } from "../ai/extract";
import { describeError } from "../ai/client";
import { fileToDataUrl } from "../lib/image";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { sampleHouse } from "../lib/sample";

export function ImportPanel({ variant }: { variant: VariantKey }) {
  const settings = useStore((s) => s.settings);
  const model = useStore((s) => s.variants[variant]);
  const setVariant = useStore((s) => s.setVariant);
  const setUi = useStore((s) => s.setUi);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

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
      <label className="file">
        {busy ? busy + "…" : model ? "Replace floorplan image" : "Choose floorplan image"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={!!busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void run(f);
            e.target.value = "";
          }}
        />
      </label>
      {!settings.apiKey && <p className="warn">Add your Anthropic API key under Settings before extracting.</p>}
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
        {!model && variant === "current" && (
          <button onClick={() => setVariant(variant, sampleHouse())}>Load sample house</button>
        )}
      </div>
    </div>
  );
}
