import { useEffect, useState } from "react";

const fmt2 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "" : String(Math.round(v * 100) / 100));

/**
 * A number input that commits each valid value as it is typed (so spinners
 * and typing both update live) but never rewrites the text while it has focus,
 * so "3." or a half-typed value is not snatched away.
 */
export function NumberField({
  value,
  onCommit,
  step = 0.01,
  min = 0,
  max,
  placeholder,
  label,
  autoFocus,
  onDone,
  onClear,
  disabled,
}: {
  value: number | undefined;
  onCommit: (v: number) => void;
  step?: number;
  /** Values must be greater than this. */
  min?: number;
  max?: number;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  /** Called on Enter or Escape (e.g. to close a pop-up field). */
  onDone?: () => void;
  /** Called when the field is emptied, for values that fall back to a default. */
  onClear?: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(fmt2(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt2(value));
  }, [value, focused]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      autoFocus={autoFocus}
      disabled={disabled}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === "" && onClear) return onClear();
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > min && (max === undefined || v <= max)) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.currentTarget.blur();
          onDone?.();
        }
      }}
    />
  );
}
