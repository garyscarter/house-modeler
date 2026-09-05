/** Image helpers for loading, resizing and gridding floorplans. */

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

/** Resize so the long edge is at most `max` px. Returns a JPEG data URL. */
export async function resizeDataUrl(src: string, max: number, quality = 0.9): Promise<string> {
  const img = await loadImage(src);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

export function splitDataUrl(dataUrl: string): { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("Unsupported image format; use JPEG, PNG or WebP");
  return { mediaType: m[1] as "image/jpeg", data: m[2] };
}

/**
 * Draw a labelled coordinate grid over the floorplan so the model can report
 * positions on a 0-1000 scale in both axes. The image itself is placed inside
 * a margin that carries the axis labels.
 */
export async function makeGriddedImage(src: string, maxEdge = 1568): Promise<string> {
  const img = await loadImage(src);
  const margin = 44;
  const s = Math.min(1, (maxEdge - margin) / Math.max(img.width, img.height));
  const w = Math.round(img.width * s);
  const h = Math.round(img.height * s);
  const c = document.createElement("canvas");
  c.width = w + margin;
  c.height = h + margin;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, margin, margin, w, h);

  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let v = 0; v <= 1000; v += 50) {
    const major = v % 100 === 0;
    const x = margin + (v / 1000) * w;
    const y = margin + (v / 1000) * h;
    ctx.strokeStyle = major ? "rgba(220,0,0,0.45)" : "rgba(220,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, margin);
    ctx.lineTo(x, margin + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(margin + w, y);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = "#c00";
      ctx.fillText(String(v), x, margin / 2);
      ctx.save();
      ctx.translate(margin / 2, y);
      ctx.fillText(String(v), 0, 0);
      ctx.restore();
    }
  }
  return c.toDataURL("image/jpeg", 0.92);
}

export async function imageSize(src: string): Promise<{ w: number; h: number }> {
  const img = await loadImage(src);
  return { w: img.width, h: img.height };
}
