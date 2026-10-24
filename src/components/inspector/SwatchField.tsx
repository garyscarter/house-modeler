import { useEffect, useRef } from "react";
import { PAINT_PALETTE, type PaintSwatch } from "../../lib/paintPalette";
import { Icon } from "../icons";

/** At most one write per `ms` while a value is being dragged, with the last value always delivered. */
export function useThrottledChange(onChange: (v: string) => void, ms = 100) {
  const latest = useRef(onChange);
  latest.current = onChange;
  const state = useRef<{ timer: number | undefined; pending: string | null }>({ timer: undefined, pending: null });
  useEffect(() => () => window.clearTimeout(state.current.timer), []);
  const flush = () => {
    const s = state.current;
    window.clearTimeout(s.timer);
    s.timer = undefined;
    if (s.pending !== null) {
      const v = s.pending;
      s.pending = null;
      latest.current(v);
    }
  };
  const push = (v: string) => {
    const s = state.current;
    if (s.timer === undefined) {
      latest.current(v);
      s.timer = window.setTimeout(() => {
        s.timer = undefined;
        if (s.pending !== null) {
          const p = s.pending;
          s.pending = null;
          latest.current(p);
        }
      }, ms);
    } else s.pending = v;
  };
  return { push, flush };
}

/**
 * A round well that opens the browser's colour picker. The native input is
 * kept (invisible, inside the well so the picker opens beside it) and driven
 * by a click, so nobody sees a 250 px colour bar. Changes while the picker is
 * dragged are throttled; the final colour is written when it closes.
 */
export function ColourWell({
  value,
  onChange,
  label,
  custom,
  size = 24,
}: {
  /** The colour shown now. */
  value: string;
  onChange: (hex: string) => void;
  label: string;
  /** True when `value` is the user's own colour (not a palette swatch): the well shows it, ringed. */
  custom?: boolean;
  size?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { push, flush } = useThrottledChange(onChange);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.addEventListener("change", flush);
    return () => el.removeEventListener("change", flush);
  });
  return (
    <span className="colour-well" style={{ width: size, height: size }}>
      <button
        type="button"
        className={`well-btn${custom ? " custom" : ""}`}
        style={custom ? { background: value } : undefined}
        title={custom ? `${label}: ${value}` : `${label}: choose another colour`}
        aria-label={`${label}: choose another colour`}
        aria-pressed={custom}
        onClick={() => {
          const el = input.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.click();
          }
        }}
      >
        {!custom && <Icon name="plus" size={12} />}
      </button>
      <input ref={input} type="color" tabIndex={-1} aria-hidden="true" value={value} onChange={(e) => push(e.target.value)} />
    </span>
  );
}

/**
 * A colour setting: a label, a row of quick colours, a round "custom" well and a
 * reset button. `value` is the colour shown (the default when `isSet` is false).
 */
export function SwatchField({
  label,
  value,
  isSet,
  onChange,
  onReset,
  resetLabel = "Back to default",
  palette = PAINT_PALETTE,
  info,
}: {
  label: string;
  value: string;
  /** Whether the user has chosen a colour (the reset button shows only then). */
  isSet: boolean;
  onChange: (hex: string) => void;
  onReset?: () => void;
  resetLabel?: string;
  palette?: readonly PaintSwatch[];
  info?: React.ReactNode;
}) {
  const v = value.toLowerCase();
  const inPalette = palette.some((s) => s.hex === v);
  return (
    <div className="swatch-field" role="group" aria-label={label}>
      <span className="kit-label">
        {label}
        {info}
      </span>
      <div className="swatch-row">
        {palette.map((s) => (
          <button
            key={s.hex}
            type="button"
            className="swatch"
            style={{ background: s.hex }}
            title={s.name}
            aria-label={`${label}: ${s.name}`}
            aria-pressed={isSet && v === s.hex}
            onClick={() => onChange(s.hex)}
          />
        ))}
        <ColourWell value={value} onChange={onChange} label={label} custom={isSet && !inPalette} />
        {onReset && (
          <button type="button" className="icon-btn reset-btn" title={resetLabel} aria-label={`${label}: ${resetLabel.toLowerCase()}`} disabled={!isSet} onClick={onReset}>
            <Icon name="undo" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
