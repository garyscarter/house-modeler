import type { Tool } from "../lib/modes";

/** A tool another panel wants armed on the plan (Floor settings' "Calibrate from two points…"). The plan may not be mounted yet, so it is parked here too. */
export const PLAN_TOOL_EVENT = "house:plan-tool";
let pending: Tool | null = null;

export function requestPlanTool(tool: Tool) {
  pending = tool;
  window.dispatchEvent(new CustomEvent(PLAN_TOOL_EVENT, { detail: tool }));
}

/** The parked tool, once: the plan calls this on mount. */
export function takePendingTool(): Tool | null {
  const t = pending;
  pending = null;
  return t;
}
