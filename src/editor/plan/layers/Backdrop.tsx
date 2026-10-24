import { memo } from "react";
import type { Rect } from "../../../lib/planMath";
import { CanopyHatch } from "./Canopies";

/** The floorplan image, and the clip and hatch the layers above refer to. */
export const Backdrop = memo(function Backdrop({
  show,
  href,
  w,
  h,
  opacity,
  faint,
  clip,
  px,
}: {
  show: boolean;
  href: string | undefined;
  w: number;
  h: number;
  opacity: number;
  faint: boolean;
  clip: Rect;
  px: number;
}) {
  return (
    <>
      {show && <image href={href} x={0} y={0} width={w} height={h} opacity={opacity} clipPath={faint ? "url(#plan-image-clip)" : undefined} />}
      <defs>
        <clipPath id="plan-image-clip">
          <rect x={clip.x0} y={clip.y0} width={clip.x1 - clip.x0} height={clip.y1 - clip.y0} />
        </clipPath>
        <CanopyHatch px={px} />
      </defs>
    </>
  );
});
