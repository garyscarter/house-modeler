import { SLOPE_TOWARD_LABEL, type SiteSurface, type SlopeToward, type SurfaceSlope } from "../types";
import { slopeGradient } from "../lib/surfaceSlope";

/** A tidy number from a text box, or the fallback. */
const num = (v: string, fallback: number) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Controls for a surface's ramp: "Slopes up" with the way it climbs and how far
 * (metres above the ground at its highest edge), plus an optional start height.
 * `onChange(undefined)` makes the surface flat at ground level again.
 */
export function SlopeFields({ surface, onChange }: { surface: SiteSurface; onChange: (slope: SurfaceSlope | undefined) => void }) {
  const slope = surface.slope;
  const gradient = slopeGradient(surface.polygon, slope);
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={!!slope} onChange={(e) => onChange(e.target.checked ? { toward: "back", rise: 0.2 } : undefined)} /> Slopes up (a ramp, with no step)
      </label>
      {slope && (
        <>
          <label>
            Climbs towards
            <select value={slope.toward} onChange={(e) => onChange({ ...slope, toward: e.target.value as SlopeToward })}>
              {(Object.keys(SLOPE_TOWARD_LABEL) as SlopeToward[]).map((k) => (
                <option key={k} value={k}>
                  {SLOPE_TOWARD_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rise (m)
            <input type="number" step={0.01} min={-1} max={2} value={slope.rise} onChange={(e) => onChange({ ...slope, rise: num(e.target.value, slope.rise) })} />
          </label>
          <label>
            Height at the low edge (m)
            <input type="number" step={0.01} min={0} max={2} value={slope.base ?? 0} onChange={(e) => onChange({ ...slope, base: Math.max(0, num(e.target.value, slope.base ?? 0)) })} />
          </label>
          <p className="muted small">
            {gradient > 0 ? `About 1 in ${Math.round(1 / gradient)} (${(gradient * 100).toFixed(1)}%). ` : ""}Heights are above the ground. The floor of the ground floor is 0.26 m up.
          </p>
        </>
      )}
    </>
  );
}
