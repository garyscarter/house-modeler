import { useEffect, useState } from "react";
import type { Photo } from "../types";

/** Longest side of a pin thumbnail, pixels. The full photos are about 1024 x 768; pins are a few metres across. */
const THUMB = 256;

/** Thumbnails as object-URL-free data URLs, made once per photo id (and re-made if the photo's pixels change). */
const cache = new Map<string, { src: string; url: Promise<string> }>();

function makeThumb(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, THUMB / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(src);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/** The 256 px thumbnail of a photo; the full image until it is ready. */
export function usePhotoThumb(photo: Photo): string {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let hit = cache.get(photo.id);
    if (!hit || hit.src !== photo.dataUrl) {
      hit = { src: photo.dataUrl, url: makeThumb(photo.dataUrl) };
      cache.set(photo.id, hit);
    }
    hit.url.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [photo.id, photo.dataUrl]);
  return url ?? photo.dataUrl;
}
