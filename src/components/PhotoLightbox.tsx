import { useEffect, useRef } from "react";
import { useStore } from "../store";

/** Swipes shorter than this (pixels) are clicks. */
const SWIPE = 50;

export function PhotoLightbox() {
  const id = useStore((s) => s.selectedPhotoId);
  const photos = useStore((s) => s.photos);
  const setUi = useStore((s) => s.setUi);
  const start = useRef<{ x: number; y: number } | null>(null);
  /** Set by a swipe so the click that follows it doesn't close the lightbox. */
  const swiped = useRef(false);
  const photo = photos.find((p) => p.id === id);
  const idx = photo ? photos.indexOf(photo) : -1;
  const go = (d: number) => setUi({ selectedPhotoId: photos[(idx + d + photos.length) % photos.length].id });
  const close = () => setUi({ selectedPhotoId: null });

  // Arrow keys step through the photos; Esc closes.
  useEffect(() => {
    if (idx < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setUi({ selectedPhotoId: photos[(idx - 1 + photos.length) % photos.length].id });
      else if (e.key === "ArrowRight") setUi({ selectedPhotoId: photos[(idx + 1) % photos.length].id });
      else if (e.key === "Escape") setUi({ selectedPhotoId: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, photos, setUi]);

  if (!photo) return null;
  return (
    <div
      className="lightbox"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || photos.length < 2) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(e.clientY - s.y)) {
          swiped.current = true;
          go(dx < 0 ? 1 : -1);
        }
      }}
      onPointerCancel={() => (start.current = null)}
      onClick={() => !swiped.current && close()}
    >
      <button className="lightbox-close" onClick={close} aria-label="Close">
        ×
      </button>
      <button className="nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous photo">
        ‹
      </button>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={photo.dataUrl} alt={photo.name} draggable={false} />
        <figcaption>
          <b>{photo.roomName ? `${photo.floorName} · ${photo.roomName}` : "Unassigned"}</b>
          {photo.description && <span> — {photo.description}</span>}
          <span className="lightbox-count">
            {idx + 1} / {photos.length}
          </span>
        </figcaption>
      </figure>
      <button className="nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next photo">
        ›
      </button>
    </div>
  );
}
