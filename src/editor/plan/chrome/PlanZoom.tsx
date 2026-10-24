import { memo } from "react";
import { Icon } from "../../../components/icons";
import { ZOOM_STEP } from "../../../lib/editorCore";
import type { Rect } from "../../../lib/planMath";

/** The zoom cluster: in, out, fit the rooms, show the whole floorplan image. */
export const PlanZoom = memo(function PlanZoom({ zoomBy, fit, imageW, imageH }: { zoomBy: (f: number) => void; fit: (r?: Rect) => void; imageW: number; imageH: number }) {
  return (
    <div className="plan-zoom float-card" role="group" aria-label="Zoom">
      <button type="button" className="icon-btn" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in (+)" title="Zoom in (+)">
        <Icon name="zoomIn" size={20} />
      </button>
      <button type="button" className="icon-btn" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out (−)" title="Zoom out (−)">
        <Icon name="zoomOut" size={20} />
      </button>
      <button type="button" className="icon-btn" onClick={() => fit()} aria-label="Fit the rooms (F)" title="Fit the rooms (F)">
        <Icon name="fit" size={20} />
      </button>
      <button type="button" className="icon-btn" onClick={() => fit({ x0: 0, y0: 0, x1: imageW, y1: imageH })} aria-label="Show the whole floorplan image" title="Show the whole floorplan image">
        <Icon name="fitImage" size={20} />
      </button>
    </div>
  );
});
