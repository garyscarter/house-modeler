import type { ReactNode } from "react";
import { NumberField } from "./NumberField";

export interface PairSide {
  /** Letter shown inside the field ("W", "D"). */
  prefix: string;
  value: number | undefined;
  onCommit: (v: number) => void;
  /** Accessible name ("Width"). */
  label: string;
  placeholder?: string;
}

/**
 * Two number fields side by side under one label, each with a prefix letter
 * inside it and a unit after it ("W 2.74 m   D 1.89 m"). Commits like NumberField.
 */
export function PairField({
  label,
  info,
  a,
  b,
  unit = "m",
  step = 0.01,
  disabled,
  children,
}: {
  label: string;
  info?: ReactNode;
  a: PairSide;
  b: PairSide;
  unit?: string;
  step?: number;
  disabled?: boolean;
  /** Content under the fields (a chip, a hint). */
  children?: ReactNode;
}) {
  const side = (s: PairSide) => (
    <span className="pair-input">
      <span className="pair-prefix" aria-hidden="true">
        {s.prefix}
      </span>
      <NumberField value={s.value} onCommit={s.onCommit} step={step} label={s.label} placeholder={s.placeholder} disabled={disabled} />
      <span className="pair-unit" aria-hidden="true">
        {unit}
      </span>
    </span>
  );
  return (
    <div className="pair-field">
      <span className="kit-label">
        {label}
        {info}
      </span>
      <div className="pair-row">
        {side(a)}
        {side(b)}
      </div>
      {children}
    </div>
  );
}
