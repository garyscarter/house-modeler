import { PLAN_TOOLS, type Mode, type Tool } from "./modes";
import { TOOL_KEY } from "./shortcuts";

/** What a single key press does in the plan editor (null: nothing, leave it to someone else). */
export type PlanKeyAction = { tool: Tool } | { rotate: 90 | 15 } | { image: true } | { fit: true } | { zoom: 1 | -1 } | { add: true } | null;

export interface PlanKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface PlanKeyContext {
  mode: Mode;
  /** A furniture item is selected. */
  fixtureSelected: boolean;
  /** An item is being placed from the Add picker. */
  placing: boolean;
}

const KEY_TOOL = new Map<string, Tool>((Object.entries(TOOL_KEY) as [Tool, string][]).map(([t, k]) => [k.toLowerCase(), t]));

/**
 * Single-key plan shortcuts (studio plan section 1.10). Keys with Ctrl, Cmd or Alt are never ours.
 * R turns furniture when one is selected or being placed (Shift+R: 15 degrees, only then);
 * otherwise it picks Rectangle where the mode has it. A tool key only counts when the mode offers that tool.
 */
export function planKeyAction(e: PlanKeyEvent, ctx: PlanKeyContext): PlanKeyAction {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "r") {
    if (ctx.fixtureSelected || ctx.placing) return { rotate: e.shiftKey ? 15 : 90 };
    if (e.shiftKey) return null;
    return PLAN_TOOLS[ctx.mode].includes("rect") ? { tool: "rect" } : null;
  }
  if (k === "i") return { image: true };
  if (k === "f") return { fit: true };
  if (k === "+" || k === "=") return { zoom: 1 };
  if (k === "-" || k === "_") return { zoom: -1 };
  if (k === "a") return ctx.mode === "furnish" ? { add: true } : null;
  const tool = KEY_TOOL.get(k);
  if (tool && PLAN_TOOLS[ctx.mode].includes(tool)) return { tool };
  return null;
}
