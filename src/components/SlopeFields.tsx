import { SLOPE_TOWARD_LABEL, type SiteSurface, type SlopeToward, type SurfaceSlope } from "../types";
import { NumberField } from "./inspector";
import { slopeGradient } from "../lib/surfaceSlope";

/**
 * Controls for a surface's ramp: "Slopes up" with the way it climbs and how far
 * (metres above the ground at its highest edge). The height of a flat, raised
 * surface is `slope.base`, set by `RaisedField`; it is kept when the ramp is
 * turned off, so `onChange` gets a flat slope with only `base` then, or
 * undefined when the surface sits on the ground.
 */
export function SlopeFields({ surface, onChange }: { surface: SiteSurface; onChange: (slope: SurfaceSlope | undefined) => void }) {
  const slope = surface.slope;
  const ramp = !!slope && slope.rise !== 0;
  const gradient = slopeGradient(surface.polygon, slope);
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={ramp}
          onChange={(e) => onChange(e.target.checked ? { toward: slope?.toward ?? "back", rise: 0.2, ...(slope?.base ? { base: slope.base } : {}) } : slope?.base ? { toward: "back", rise: 0, base: slope.base } : undefined)}
        />{" "}
        Slopes up (a ramp, with no step)
      </label>
      {ramp && slope && (
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
            {/* A rise of 0 means "no ramp": the checkbox does that, so a half-typed "0" must not. */}
            <NumberField value={slope.rise} step={0.01} min={-1} max={2} label="Rise in metres" onCommit={(rise) => rise !== 0 && onChange({ ...slope, rise })} />
          </label>
          <p className="muted small">
            {gradient > 0 ? `About 1 in ${Math.round(1 / gradient)} (${(gradient * 100).toFixed(1)}%). ` : ""}The rise is on top of the raised height below. The floor of the ground floor is 0.26 m up.
          </p>
        </>
      )}
    </>
  );
}

/**
 * How far a surface's top stands above the ground, cm: a raised bed's soil
 * level, a terrace, a step up. Stored as `slope.base`; a ramp's rise climbs
 * from there. Zero with no ramp clears the slope.
 */
export function RaisedField({ surface, onChange }: { surface: SiteSurface; onChange: (slope: SurfaceSlope | undefined) => void }) {
  const slope = surface.slope;
  const cm = Math.round((slope?.base ?? 0) * 100);
  return (
    <label>
      Raised above the ground (cm)
      <NumberField
        value={cm}
        step={1}
        min={0}
        max={200}
        label="Raised above the ground in centimetres"
        onCommit={(v) => {
          const base = v / 100;
          if (!base && !(slope && slope.rise !== 0)) onChange(undefined);
          else onChange({ toward: slope?.toward ?? "back", rise: slope?.rise ?? 0, ...(base ? { base } : {}) });
        }}
      />
    </label>
  );
}
