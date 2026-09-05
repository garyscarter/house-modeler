import { useState } from "react";
import { useStore } from "../store";
import { assignPhotos } from "../ai/photos";
import { describeError } from "../ai/client";
import { fileToDataUrl, resizeDataUrl } from "../lib/image";
import { ELEVATION_LABEL, uid, type Elevation, type Photo } from "../types";

export function PhotosPanel() {
  const photos = useStore((s) => s.photos);
  const model = useStore((s) => s.variants.current ?? s.variants.proposed);
  const settings = useStore((s) => s.settings);
  const addPhotos = useStore((s) => s.addPhotos);
  const updatePhoto = useStore((s) => s.updatePhoto);
  const removePhoto = useStore((s) => s.removePhoto);
  const setUi = useStore((s) => s.setUi);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList) => {
    const added: Photo[] = [];
    for (const f of Array.from(files)) {
      const raw = await fileToDataUrl(f);
      const dataUrl = await resizeDataUrl(raw, 1600, 0.85);
      added.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), dataUrl });
    }
    addPhotos(added);
  };

  const autoAssign = async () => {
    if (!model) return;
    setError(null);
    try {
      const unassigned = photos.filter((p) => !p.roomName && !p.elevation);
      const res = await assignPhotos(settings.apiKey, settings.model, model, unassigned.length ? unassigned : photos, setBusy);
      for (const [id, a] of res) updatePhoto(id, a);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const rooms = model?.floors.flatMap((f) => f.rooms.map((r) => ({ floorName: f.name, roomName: r.name }))) ?? [];

  return (
    <div className="panel">
      <h3>Photos</h3>
      <p className="muted">
        Upload the listing photos. Claude works out which room each one shows; they appear as pins in the 3D view and can be used as floor
        textures.
      </p>
      <div className="row">
        <label className="file">
          Add photos
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <button disabled={!model || !photos.length || !!busy} onClick={autoAssign}>
          {busy ? busy + "…" : "Match photos to rooms"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!model && photos.length > 0 && <p className="warn">Extract a floorplan first so photos have rooms to match against.</p>}
      <div className="photo-grid">
        {photos.map((p) => (
          <div key={p.id} className="photo-card">
            <img src={p.dataUrl} alt={p.name} onClick={() => setUi({ selectedPhotoId: p.id })} />
            <select
              value={p.roomName ? `${p.floorName}|${p.roomName}` : p.elevation ? `ext|${p.elevation}` : ""}
              onChange={(e) => {
                const [a, b] = e.target.value.split("|");
                if (a === "ext") updatePhoto(p.id, { floorName: undefined, roomName: undefined, elevation: b as Elevation });
                else updatePhoto(p.id, { floorName: a || undefined, roomName: b || undefined, elevation: undefined });
              }}
            >
              <option value="">Unassigned</option>
              <optgroup label="Exterior">
                {(Object.keys(ELEVATION_LABEL) as Elevation[]).map((e) => (
                  <option key={e} value={`ext|${e}`}>
                    {ELEVATION_LABEL[e]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Rooms">
                {rooms.map((r) => (
                  <option key={`${r.floorName}|${r.roomName}`} value={`${r.floorName}|${r.roomName}`}>
                    {r.floorName}: {r.roomName}
                  </option>
                ))}
              </optgroup>
            </select>
            {p.description && (
              <div className="muted small" title={p.description}>
                {p.description}
                {p.confidence !== undefined && p.confidence < 0.6 && " (low confidence)"}
              </div>
            )}
            <button className="link" onClick={() => removePhoto(p.id)}>
              remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
