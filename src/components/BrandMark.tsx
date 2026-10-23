import { MARK } from "../lib/brand";

/**
 * The Storey mark: roof, first floor and ground floor stacked, in currentColor.
 * "outline" draws it as a still, dashed blueprint for empty states. The app icons come from scripts/make-icons.mjs.
 */
export function BrandMark({ size = 20, outline = false }: { size?: number; outline?: boolean }) {
  if (outline) {
    return (
      <svg className="brand-outline" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray="3 2.5" strokeLinejoin="round" aria-hidden="true">
        <path d={MARK.ground} />
        <path d={MARK.first} />
        <path d={MARK.roof} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <path d={MARK.roof} stroke="currentColor" strokeWidth={MARK.roofStroke} strokeLinejoin="round" />
      <path d={MARK.first} />
      <path d={MARK.ground} />
    </svg>
  );
}
