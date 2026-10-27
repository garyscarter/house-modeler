import { FLOOR_FINISH_LABEL, VARIANT_LABEL, type Floor, type FloorFinish, type HouseModel, type Room, type VariantKey } from "../types";
import { PAINT_PALETTE } from "./paintPalette";
import { MODES, MODE_LABEL, type Mode } from "./modes";
import { usePanelPrefs } from "../components/panelPrefs";
import { useChassis } from "../components/useChassis";
import { FEATURES } from "./chassis";
import { floorDisplayName, type Look } from "./studio";
import { sectionStops } from "./sectionCut";

export interface Command {
  id: string;
  title: string;
  /** Muted context shown on the right (floor name, "View", ...). */
  group: string;
  /** Keyboard hint, if there is one. */
  hint?: string;
  keywords?: string[];
  run: () => void;
}

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Score one query word against the text's words; 0 = no match. Scattered letters only count for queries of 4+ letters. */
function wordScore(q: string, tw: string[], lower: string): number {
  let best = 0;
  tw.forEach((w, i) => {
    if (w === q) best = Math.max(best, 100 - i);
    else if (w.startsWith(q)) best = Math.max(best, 80 - i);
  });
  if (best) return best;
  // Subsequence within the text (scattered): too noisy for short queries.
  if (q.length < 4) return 0;
  let at = 0;
  for (const ch of q) {
    at = lower.indexOf(ch, at);
    if (at < 0) return 0;
    at++;
  }
  return 10;
}

/**
 * Case-insensitive match: every query word must prefix a word of the text or be a subsequence of it.
 * Word-start and prefix matches score higher than scattered ones. 0 = no match.
 */
export function fuzzyScore(query: string, text: string): number {
  const qw = words(query);
  if (qw.length === 0) return 1;
  const lower = text.toLowerCase();
  const tw = words(text);
  let total = 0;
  for (const q of qw) {
    const s = wordScore(q, tw, lower);
    if (!s) return 0;
    total += s;
  }
  return total / qw.length;
}

/** Commands matching the query, best first. An empty query keeps the given order. */
export function rankCommands(query: string, commands: Command[], limit = 12): Command[] {
  if (!query.trim()) return commands.slice(0, limit);
  return commands
    .map((c, i) => ({ c, i, s: Math.max(fuzzyScore(query, c.title), fuzzyScore(query, `${c.title} ${c.group} ${(c.keywords ?? []).join(" ")}`) * 0.8) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

export type ViewSide = "front" | "rear" | "left" | "right" | "top" | "home";

export interface CommandContext {
  variants: Partial<Record<VariantKey, HouseModel>>;
  activeVariant: VariantKey;
  tab: "3d" | "plan";
  viewMode: "single" | "side-by-side" | "overlay" | "wipe";
  mode: Mode;
  setMode: (m: Mode) => void;
  look: Look;
  setLook: (l: Look) => void;
  selectedRoomId: string | null;
  showLabels: boolean;
  showCeilings: boolean;
  doorsOpen: boolean;
  showExterior: boolean;
  showSite: boolean;
  quality: "high" | "balanced" | "low";
  siteEditId: string;
  isMac: boolean;
  setUi: (p: Record<string, unknown>) => void;
  updateRoom: (k: VariantKey, floorId: string, roomId: string, patch: Partial<Room>) => void;
  setSettings: (s: { quality: "high" | "balanced" | "low" }) => void;
  undo: () => void;
  redo: () => void;
  /** Dispatches a window event (injected so tests need no DOM). */
  dispatch: (name: string, detail: unknown) => void;
  savedViews: { id: string; name: string }[];
  saveView: () => void;
  goToView: (id: string) => void;
}

export const isMacPlatform = (): boolean => typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || "");

export function buildCommands(c: CommandContext): Command[] {
  const model = c.variants[c.activeVariant];
  const floors: Floor[] = model?.floors ?? [];
  const mod = c.isMac ? "⌘" : "Ctrl+";
  const shift = c.isMac ? "⇧" : "Shift+";
  const out: Command[] = [];
  const add = (id: string, title: string, group: string, run: () => void, extra: Partial<Command> = {}) => out.push({ id, title, group, run, ...extra });

  for (const f of floors) {
    for (const r of f.rooms) {
      add(`room:${f.id}:${r.id}`, `Go to ${r.name} · ${floorDisplayName(f.name)}`, floorDisplayName(f.name), () => c.setUi({ tab: "plan", editFloorId: f.id, selectedRoomId: r.id }), { keywords: ["room"] });
    }
  }

  let sel: { floor: Floor; room: Room } | undefined;
  for (const f of floors) {
    const r = f.rooms.find((x) => x.id === c.selectedRoomId);
    if (r) sel = { floor: f, room: r };
  }

  for (const f of floors) add(`plan:${f.id}`, `Plan: ${floorDisplayName(f.name)}`, "Plan", () => c.setUi({ tab: "plan", editFloorId: f.id }), { keywords: ["floor", "edit"] });
  add("plan:site", "Site plan (Plot)", "Plan", () => {
    c.setMode("plot");
    c.setUi({ tab: "plan" });
  }, { keywords: ["plot", "boundary", "neighbours", "site", "orientation"] });
  add("plan:garden", "Garden", "Plan", () => {
    c.setMode("garden");
    c.setUi({ tab: "plan" });
  }, { keywords: ["garden", "plants", "lawn", "patio", "furniture", "lights", "trees", "hedge"] });

  for (const k of ["current", "proposed"] as VariantKey[]) {
    if (c.variants[k] && k !== c.activeVariant) add(`layout:${k}`, `Switch to ${VARIANT_LABEL[k]}`, "Layout", () => c.setUi({ activeVariant: k }), { keywords: ["layout", "variant"] });
  }

  add("view:3d", "3D", "View", () => c.setUi({ tab: "3d" }));
  add("view:plan", "Plan", "View", () => c.setUi({ tab: "plan" }), { keywords: ["2d", "plan"] });
  if (c.variants.current && c.variants.proposed) {
    const modes = [["single", "Single"], ["side-by-side", "Side by side"], ["overlay", "Overlay"], ["wipe", "Wipe"]] as const;
    const sideBySide = FEATURES[useChassis.getState().chassis].sideBySide;
    for (const [m, label] of modes) {
      if (m === "side-by-side" && !sideBySide) continue;
      add(`compare:${m}`, `Compare: ${label}`, "View", () => c.setUi({ viewMode: m }), { keywords: ["view mode"] });
    }
  }

  const toggle = (id: string, noun: string, on: boolean, key: string) =>
    add(`toggle:${id}`, `${on ? "Hide" : "Show"} ${noun}`, "View", () => c.setUi({ [key]: !on }), { keywords: ["toggle"] });
  toggle("labels", "labels", c.showLabels, "showLabels");
  toggle("ceilings", "ceilings", c.showCeilings, "showCeilings");
  add("toggle:doors", c.doorsOpen ? "Close doors" : "Open doors", "View", () => c.setUi({ doorsOpen: !c.doorsOpen }), { keywords: ["toggle", "doors open"] });
  toggle("exterior", "exterior", c.showExterior, "showExterior");
  toggle("site", "site", c.showSite, "showSite");
  if (model) for (const st of sectionStops(model)) if (st.kind === "floor") add(`section:${st.id}`, `Section cut: ${st.label}`, "View", () => c.setUi({ tab: "3d", sectionHeight: st.height }), { keywords: ["cut", "slice", "doll's house", "look inside"] });
  add("section:off", "Section cut: off", "View", () => c.setUi({ sectionHeight: null }), { keywords: ["cut", "slice"] });

  if (c.tab === "3d") {
    const sides: [ViewSide, string][] = [["front", "Look at the front"], ["rear", "Look at the rear"], ["left", "Look at the left"], ["right", "Look at the right"], ["top", "Look at the top"], ["home", "Home view"]];
    for (const [side, title] of sides) add(`camera:${side}`, title, "Camera", () => c.dispatch("house:view", { side }), { keywords: ["camera"] });
    add("camera:save", "Save this camera view", "Camera", c.saveView, { keywords: ["bookmark", "view"] });
  }
  for (const v of c.savedViews) add(`savedview:${v.id}`, `Go to view: ${v.name}`, "Camera", () => c.goToView(v.id), { keywords: ["camera", "bookmark", "saved"] });

  add("review:report", "Open report", "Review", () => c.dispatch("house:open-review", { section: "report" }), { keywords: ["areas", "costs"] });
  add("review:planning", "Open planning check", "Review", () => c.dispatch("house:open-review", { section: "planning" }), { keywords: ["permitted development"] });

  for (const m of MODES) add(`mode:${m}`, `Mode: ${MODE_LABEL[m]}`, "Mode", () => c.setMode(m), { keywords: ["mode"] });
  const other: Look = c.look === "glass" ? "studio" : "glass";
  add(`look:${other}`, `Look: ${other === "glass" ? "Glass" : "Studio"}`, "Settings", () => c.setLook(other), { keywords: ["look", "theme", "appearance"] });

  add("my-furniture-add", "Add a piece of furniture I own", "Furnish", () => {
    c.setMode("furnish");
    c.dispatch("house:add-piece", {});
  }, { keywords: ["mine", "own", "sofa", "measure"] });
  add("edit:undo", "Undo", "Edit", c.undo, { hint: `${mod}Z` });
  add("edit:redo", "Redo", "Edit", c.redo, { hint: `${mod}${shift}Z` });

  if (sel) {
    const { floor, room } = sel;
    for (const k of Object.keys(FLOOR_FINISH_LABEL) as FloorFinish[]) {
      add(`finish:${k}`, `Floor finish: ${FLOOR_FINISH_LABEL[k]}`, room.name, () => {
        // Same patch as the room inspector's Floor finish select.
        c.updateRoom(c.activeVariant, floor.id, room.id, { floorFinish: k === "plain" ? undefined : k, ...(k !== "plain" && room.color ? { color: undefined } : {}) });
      }, { keywords: ["floor", "flooring"] });
    }
    for (const s of PAINT_PALETTE) {
      add(`paint:${s.hex}`, `Paint walls: ${s.name}`, room.name, () => c.updateRoom(c.activeVariant, floor.id, room.id, { wallPaint: s.hex }), { keywords: ["colour", "color", "wall"] });
    }
  }

  for (const q of ["high", "balanced", "low"] as const) {
    add(`quality:${q}`, `Render quality: ${q[0].toUpperCase()}${q.slice(1)}`, "Settings", () => c.setSettings({ quality: q }), { keywords: ["graphics", "settings"] });
  }

  // Canvas and photo pins are per-browser panel preferences, so these write them directly.
  const prefs = usePanelPrefs.getState();
  add("canvas:quiet", "Canvas: Quiet", "Settings", () => usePanelPrefs.getState().setPrefs({ quiet: true }), { keywords: ["canvas", "neighbours", "ground", "calm"] });
  add("canvas:full", "Canvas: Full", "Settings", () => usePanelPrefs.getState().setPrefs({ quiet: false }), { keywords: ["canvas", "neighbours", "ground", "textures"] });
  add("pins:toggle", `Photo pins: ${prefs.showPins ? "hide" : "show"}`, "View", () => usePanelPrefs.getState().setPrefs({ showPins: !usePanelPrefs.getState().showPins }), { keywords: ["photos", "pins", "cameras"] });
  return out;
}

/** Short list for an empty query: a few rooms first, then common actions. */
export function defaultCommands(all: Command[]): Command[] {
  const rooms = all.filter((x) => x.id.startsWith("room:")).slice(0, 4);
  const common = ["view:3d", "view:plan", "edit:undo", "edit:redo", "review:report"].map((id) => all.find((x) => x.id === id)).filter((x): x is Command => !!x);
  return [...rooms, ...common];
}
