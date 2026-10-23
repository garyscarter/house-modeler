import { useState } from "react";
import { useStore } from "../store";
import { fileToDataUrl, resizeDataUrl } from "../lib/image";
import { ELEVATION_LABEL, uid, type Elevation, type Photo } from "../types";
import { listingPhotos } from "../lib/houses/listingAssets";
import { floorDisplayName } from "../lib/studio";
import { Info } from "./Info";

export function PhotosPanel({ inDialog = false }: { inDialog?: boolean } = {}) {
  const photos = useStore((s) => s.photos);
  const model = useStore((s) => s.variants.current ?? s.variants.proposed);
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

  const isListing = model?.preset?.id.startsWith("listing-91770873") ?? false;
  const rooms = model?.floors.flatMap((f) => f.rooms.map((r) => ({ floorName: f.name, roomName: r.name }))) ?? [];

  return (
    <div className="panel">
      {!inDialog && (
        <h3 className="with-info">
          Photos
          <Info>Load the listing photos or add your own, then pick the room or side of the house each one shows. They appear as pins in the 3D view and can be used as floor textures.</Info>
        </h3>
      )}
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
        {isListing && !photos.some((p) => p.name === "front-1") && (
          <button
            disabled={!!busy}
            title="Add the listing's 37 photos, already placed in their rooms or beside the right side of the house"
            onClick={async () => {
              setBusy("Loading listing photos");
              try {
                addPhotos(await listingPhotos());
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not load the photos.");
              } finally {
                setBusy(null);
              }
            }}
          >
            Load listing 91770873 photos
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
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
