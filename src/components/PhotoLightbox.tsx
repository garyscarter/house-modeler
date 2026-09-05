import { useStore } from "../store";

export function PhotoLightbox() {
  const id = useStore((s) => s.selectedPhotoId);
  const photos = useStore((s) => s.photos);
  const setUi = useStore((s) => s.setUi);
  const photo = photos.find((p) => p.id === id);
  if (!photo) return null;
  const idx = photos.indexOf(photo);
  const go = (d: number) => setUi({ selectedPhotoId: photos[(idx + d + photos.length) % photos.length].id });
  return (
    <div className="lightbox" onClick={() => setUi({ selectedPhotoId: null })}>
      <button className="nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }}>
        ‹
      </button>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={photo.dataUrl} alt={photo.name} />
        <figcaption>
          <b>{photo.roomName ? `${photo.floorName} · ${photo.roomName}` : "Unassigned"}</b>
          {photo.description && <span> — {photo.description}</span>}
        </figcaption>
      </figure>
      <button className="nav next" onClick={(e) => { e.stopPropagation(); go(1); }}>
        ›
      </button>
    </div>
  );
}
