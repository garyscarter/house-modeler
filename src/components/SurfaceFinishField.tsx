import { SURFACE_FINISH_LABEL, type SiteSurface, type SurfaceFinish } from "../types";
import { canHaveFinish } from "../lib/surfaceFinish";

/** Picker for what a drive, patio, path or pavement is laid with; "As usual" clears the choice. Nothing for lawns, beds and roads. */
export function SurfaceFinishField({ surface, onChange }: { surface: SiteSurface; onChange: (finish: SurfaceFinish | undefined) => void }) {
  if (!canHaveFinish(surface.kind)) return null;
  return (
    <label>
      Laid with
      <select value={surface.finish ?? ""} onChange={(e) => onChange(e.target.value ? (e.target.value as SurfaceFinish) : undefined)} aria-label="Surface finish">
        <option value="">As usual for {surface.kind === "drive" ? "a drive" : surface.kind === "patio" ? "a patio" : `a ${surface.kind}`}</option>
        {(Object.keys(SURFACE_FINISH_LABEL) as SurfaceFinish[]).map((k) => (
          <option key={k} value={k}>
            {SURFACE_FINISH_LABEL[k]}
          </option>
        ))}
      </select>
    </label>
  );
}
