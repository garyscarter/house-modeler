import { useState } from "react";
import { NumberField } from "./NumberField";

const PRESETS = [0, 45, 90];

/**
 * Pattern direction as a small segmented control: 0° / 45° / 90° / Along room,
 * with "Other…" revealing a number field for any other angle.
 */
export function DirectionField({
  angle,
  alongRoom,
  onChange,
}: {
  /** The current angle, degrees. */
  angle: number;
  /** The angle that runs the pattern along the room's longest wall. */
  alongRoom: number;
  onChange: (degrees: number) => void;
}) {
  const isPreset = PRESETS.includes(angle) || angle === alongRoom;
  const [other, setOther] = useState(false);
  const showOther = other || !isPreset;
  const pick = (a: number) => {
    setOther(false);
    onChange(a);
  };
  return (
    <div className="direction-field">
      <span className="kit-label">Direction</span>
      <div className="seg small" role="group" aria-label="Pattern direction">
        {PRESETS.map((a) => (
          <button key={a} type="button" className={!showOther && angle === a ? "active" : ""} aria-pressed={!showOther && angle === a} onClick={() => pick(a)}>
            {a}°
          </button>
        ))}
        <button
          type="button"
          className={!showOther && angle === alongRoom && !PRESETS.includes(angle) ? "active" : ""}
          aria-pressed={!showOther && angle === alongRoom && !PRESETS.includes(angle)}
          title="Run the pattern along the room's longest wall"
          onClick={() => pick(alongRoom)}
        >
          Along room
        </button>
        <button type="button" className={showOther ? "active" : ""} aria-pressed={showOther} onClick={() => setOther(true)}>
          Other…
        </button>
      </div>
      {showOther && (
        <div className="direction-other">
          <span className="pair-input">
            <NumberField value={angle} min={-361} max={360} step={5} label="Floor pattern angle" onCommit={onChange} />
            <span className="pair-unit" aria-hidden="true">
              °
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
