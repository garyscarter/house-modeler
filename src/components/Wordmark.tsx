import { BRAND_NAME, WORDMARK, wordmarkCut, wordmarkWidth } from "../lib/brand";

/** The Storey wordmark ("storey" in Bricolage Grotesque 250) as outlines, `height` px tall, in currentColor. */
export function Wordmark({ height = 16, className }: { height?: number; className?: string }) {
  const cut = wordmarkCut(height);
  const { d, viewBox } = WORDMARK[cut];
  return (
    <svg className={className} width={wordmarkWidth(height, cut)} height={height} viewBox={viewBox.join(" ")} fill="currentColor" role="img" aria-label={BRAND_NAME}>
      <path d={d} />
    </svg>
  );
}
