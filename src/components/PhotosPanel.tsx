import { useState } from "react";
import { useStore } from "../store";
import { fileToDataUrl, resizeDataUrl } from "../lib/image";
import { ELEVATION_LABEL, uid, type Elevation, type Photo } from "../types";
import { belongsToHouse, useCurrentHouse } from "../lib/house";
import { Loader } from "./Loader";
import { floorDisplayName } from "../lib/studio";

export function PhotosPanel() {
  const photos = useStore((s) => s.photos);
  const house = useCurrentHouse();
  const model = useStore((s) => s.variants.current ?? s.variants.proposed);
  const addPhotos = useStore((s) => s.addPhotos);
  const updatePhoto = useStore((s) => s.updatePhoto);
  const removePhoto = useStore((s) => s.removePhoto);
  const setUi = useStore((s) => s.setUi);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
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

  const isListing = belongsToHouse(house, model?.preset?.id);
  const rooms = model?.floors.flatMap((f) => f.rooms.map((r) => ({ floorName: f.name, roomName: r.name }))) ?? [];

  return (
    <div className="panel">
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
        {isListing && house.photos && house.photoMarker && !photos.some((p) => p.name === house.photoMarker) && (
          <button
            disabled={!!loading}
            title="Add the house's photos, already placed in their rooms or beside the right side of the house"
            onClick={async () => {
              setLoading({ done: 0, total: 0 });
              try {
                addPhotos(await house.photos!((done, total) => setLoading({ done, total })));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not load the photos.");
              } finally {
                setLoading(null);
              }
            }}
          >
            {loading ? (
              <>
                <Loader kind="fill" size={14} progress={loading.total ? loading.done / loading.total : 0} />
                Loading photos {loading.done} of {loading.total}
              </>
            ) : (
              `Load ${house.name} photos`
            )}
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {photos.length === 0 && <p className="muted">No photos yet. Load the house's photos or add your own, then pick the room each one shows.</p>}
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
                    {floorDisplayName(r.floorName)}: {r.roomName}
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
