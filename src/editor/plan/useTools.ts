import { useEffect, useRef, useState } from "react";
import type { CatalogueItem } from "../../lib/catalogue";
import type { Mode, Tool } from "../../lib/modes";
import { useStore } from "../../store";
import type { Floor, Pt } from "../../types";
import { pieceItem } from "../../lib/myFurniture";
import { takePendingPlace } from "../MyFurniture";
import { PLAN_TOOL_EVENT, takePendingTool } from "../planTool";

/**
 * The tool in hand and its in-progress shapes (draft, calibration and measure points, the item being placed), the
 * pointer position the drawing tools follow, and the two requests that arm a tool from outside the plan.
 * `closeEdgeEdit` is the selection's: picking a tool closes the edge-length field.
 */
export function usePlanTools(mode: Mode, floor: Floor, closeEdgeEdit: () => void) {
  const [tool, setTool] = useState<Tool>(mode === "build" && !floor.rooms.length ? "rect" : "select");
  const [calib, setCalib] = useState<Pt[]>([]);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const [measure, setMeasure] = useState<Pt[]>([]);
  const [placing, setPlacing] = useState<{ item: CatalogueItem; rot: number } | null>(null);

  const pick = (t: Tool) => {
    setTool(t);
    setCalib([]);
    setDraft([]);
    setMeasure([]);
    closeEdgeEdit();
    if (t !== "place") setPlacing(null);
  };
  const startPlacing = (item: CatalogueItem) => {
    setPlacing({ item, rot: placing?.rot ?? 0 });
    setTool("place");
    setCalib([]);
    setDraft([]);
    setMeasure([]);
  };

  // A tool asked for from outside (Floor settings' "Calibrate from two points…"): on mount, or while the plan is open.
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    const take = () => {
      const t = takePendingTool();
      if (t) pickRef.current(t);
    };
    take();
    window.addEventListener(PLAN_TOOL_EVENT, take);
    return () => window.removeEventListener(PLAN_TOOL_EVENT, take);
  }, []);

  // "Place" on a piece in the Furnish panel starts placing it here (also when the plan was only just opened).
  useEffect(() => {
    const go = () => {
      const id = takePendingPlace();
      const piece = id ? useStore.getState().pieces.find((p) => p.id === id) : undefined;
      if (piece) startPlacing(pieceItem(piece));
    };
    go();
    window.addEventListener("house:place-piece", go);
    return () => window.removeEventListener("house:place-piece", go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tool, setTool, calib, setCalib, draft, setDraft, hover, setHover, altHeld, setAltHeld, measure, setMeasure, placing, setPlacing, pick, startPlacing };
}
export type PlanTools = ReturnType<typeof usePlanTools>;
