import { PAINT_PALETTE } from "../lib/paintPalette";

/** A row of quick paint colours from the modern palette; the one matching `value` is ringed. */
export function ColourSwatches({ value, onPick, label }: { value: string; onPick: (hex: string) => void; label: string }) {
  const v = value.toLowerCase();
  return (
    <div className="swatches" role="group" aria-label={label}>
      {PAINT_PALETTE.map((s) => (
        <button
          key={s.hex}
          type="button"
          className="swatch"
          style={{ background: s.hex }}
          title={s.name}
          aria-label={`${label}: ${s.name}`}
          aria-pressed={v === s.hex}
          onClick={() => onPick(s.hex)}
        />
      ))}
    </div>
  );
}
