/** The Storey mark: roof, first floor and ground floor stacked. Drawn in currentColor; the app icons come from scripts/make-icons.mjs. */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <path d="M10 27L32 9L54 27Z" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
      <rect x={12} y={31} width={40} height={10} rx={2} />
      <rect x={12} y={45} width={40} height={10} rx={2} />
    </svg>
  );
}
