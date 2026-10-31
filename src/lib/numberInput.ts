/** Rules for a typed number: what to commit while typing, and what to settle on when focus leaves. */

/** The smallest value a field takes unless it says otherwise (a size is positive). */
export const DEFAULT_MIN = 0.001;

export interface NumberRange {
  /** Inclusive lower bound. */
  min?: number;
  /** Inclusive upper bound. */
  max?: number;
}

const read = (text: string): number | undefined => {
  if (text.trim() === "") return undefined;
  const v = Number(text);
  return Number.isFinite(v) ? v : undefined;
};

const clamp = (v: number, { min = DEFAULT_MIN, max = Infinity }: NumberRange) => Math.min(max, Math.max(min, v));

/** While typing: the value to commit, or undefined when the text is empty, half typed or out of range. */
export function typedValue(text: string, range: NumberRange = {}): number | undefined {
  const v = read(text);
  return v !== undefined && clamp(v, range) === v ? v : undefined;
}

/** On blur: the clamped value to commit when the text is a number outside the range, else undefined (nothing to do). */
export function blurValue(text: string, range: NumberRange = {}): number | undefined {
  const v = read(text);
  if (v === undefined) return undefined;
  const c = clamp(v, range);
  return c === v ? undefined : c;
}
