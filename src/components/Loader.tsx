import { useId } from "react";
import { MARK } from "../lib/brand";

// The Storey mark in three parts (ground floor, first floor, roof), animated by the .loader rules in styles.css.
const { roof: ROOF, first: FIRST, ground: GROUND } = MARK;
// The roof grown by its stroke, so the rising fill covers the drawn roof edge.
const ROOF_CLIP = "M7.6 28.5L32 7L56.4 28.5Z";

function Parts() {
  return (
    <>
      <path className="ld-part ld-ground" d={GROUND} pathLength={1} />
      <path className="ld-part ld-first" d={FIRST} pathLength={1} />
      <path className="ld-part ld-roof" d={ROOF} pathLength={1} />
    </>
  );
}

/**
 * A loading mark. "blueprint": the floors are drawn in outline, then filled (for waits people watch).
 * "lift": a light runs up the floors (small, inline: busy buttons and status lines).
 * "fill": the mark fills from the ground up; pass progress (0 to 1) to show it, or leave it out to loop.
 * Decorative: the text beside it says what is loading.
 */
export function Loader({ kind, size = 16, progress }: { kind: "blueprint" | "lift" | "fill"; size?: number; progress?: number }) {
  const clipId = useId();
  if (kind !== "fill") {
    return (
      <svg className={`loader loader-${kind}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <Parts />
      </svg>
    );
  }
  const p = progress === undefined ? undefined : Math.min(1, Math.max(0, progress));
  return (
    <svg className={`loader loader-fill${p === undefined ? " loader-loop" : ""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={GROUND} />
          <path d={FIRST} />
          <path d={ROOF_CLIP} />
        </clipPath>
      </defs>
      <g className="ld-ghost">
        <Parts />
      </g>
      <g clipPath={`url(#${clipId})`}>
        <rect className="ld-level" x={0} y={7} width={64} height={49} style={p === undefined ? undefined : { transform: `scaleY(${p})` }} />
      </g>
    </svg>
  );
}
