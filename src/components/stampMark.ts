import { BRAND_DISPLAY_FONT, BRAND_INK, BRAND_NAME, BRAND_TEAL, MARK } from "../lib/brand";

/** Draw the stacked-floors mark at (x, y) in a size x size box. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = MARK.roofStroke;
  ctx.lineJoin = "round";
  ctx.fill(new Path2D(MARK.ground));
  ctx.fill(new Path2D(MARK.first));
  const roof = new Path2D(MARK.roof);
  ctx.fill(roof);
  ctx.stroke(roof);
  ctx.restore();
}

const loadImage = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the snapshot."));
    };
    img.src = url;
  });

/** The snapshot with a small "Storey" badge (white rounded rectangle, teal mark, ink wordmark) in its bottom-right corner. */
export async function stampMark(blob: Blob): Promise<Blob> {
  const img = await loadImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.drawImage(img, 0, 0);

  const h = Math.max(28, Math.round(canvas.height * 0.04));
  const margin = h;
  const pad = h * 0.22;
  const markSize = h - pad * 2;
  const fontPx = Math.round(h * 0.5);
  try {
    // Make sure the display font is ready if the app has it; otherwise the fallback stack is used.
    await document.fonts?.load(`700 ${fontPx}px ${BRAND_DISPLAY_FONT}`);
  } catch {
    // Fall back silently.
  }
  ctx.font = `700 ${fontPx}px ${BRAND_DISPLAY_FONT}`;
  const textW = ctx.measureText(BRAND_NAME).width;
  const w = Math.round(pad + markSize + pad * 0.8 + textW + pad * 1.4);
  const x = canvas.width - margin - w;
  const y = canvas.height - margin - h;

  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h * 0.22);
  ctx.fill();
  ctx.restore();

  drawMark(ctx, x + pad, y + pad, markSize, BRAND_TEAL);
  ctx.fillStyle = BRAND_INK;
  ctx.textBaseline = "middle";
  ctx.fillText(BRAND_NAME, x + pad + markSize + pad * 0.8, y + h / 2 + h * 0.02);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the snapshot."))), "image/png"));
}
