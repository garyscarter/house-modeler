import { VARIANT_LABEL, type HouseModel, type VariantKey } from "../types";
import { downloadBlob, fileDate, slug } from "../lib/export";
import { downloadPrefix } from "../lib/brand";
import { houseName } from "../lib/studio";
import { stampMark } from "./stampMark";
import { openRender } from "./renderRequest";

// Snapshots and model export use three.js, which loads with the 3D view; fetch them when used.
export const captureImage = async (...a: Parameters<typeof import("../three/capture").captureImage>) => (await import("../three/capture")).captureImage(...a);
export const exportGlb = async (...a: Parameters<typeof import("../three/capture").exportGlb>) => (await import("../three/capture")).exportGlb(...a);

/** The layout a capture id shows: "current" and "proposed" side by side, else the active variant. */
export const captureLabel = (id: string, active: VariantKey): string => (id === "current" || id === "proposed" ? VARIANT_LABEL[id] : VARIANT_LABEL[active]);

/** The file-name prefix for downloads: the house's name, whichever layout is loaded. */
export function filePrefix(variants: Partial<Record<VariantKey, HouseModel>>, active: VariantKey): string {
  const any = variants[active] ?? Object.values(variants).find(Boolean);
  return downloadPrefix(slug(houseName(any)));
}

/** Save a PNG of each 3D view (`scaleBy` 2 for double size). Returns a note to show when more than one file was saved. */
export async function saveSnapshots(opts: { ids: string[]; active: VariantKey; scaleBy: number; stamp: boolean; prefix: string }): Promise<string | undefined> {
  const { ids, active, scaleBy, stamp, prefix } = opts;
  const date = fileDate();
  for (const id of ids) {
    const shot = await captureImage(id, scaleBy);
    const blob = stamp ? await stampMark(shot) : shot;
    downloadBlob(blob, `${prefix}-3d-${slug(captureLabel(id, active))}-${date}${scaleBy > 1 ? `@${scaleBy}x` : ""}.png`);
  }
  return ids.length > 1 ? "Saved a snapshot of each view." : undefined;
}

/** Open the path-traced Render dialog for a 3D view as it is now. */
export const renderStill = (id: string, active: VariantKey, stamp: boolean): void => openRender({ id, pose: null, label: captureLabel(id, active), stamp });
