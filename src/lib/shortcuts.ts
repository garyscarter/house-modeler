import type { Tool } from "./modes";

export interface Shortcut {
  keys: string[];
  action: string;
}
export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/** Plan tool names, as shown in the rail's tooltips. */
export const TOOL_LABEL: Record<Tool, string> = {
  select: "Select",
  rect: "Rectangle room",
  room: "Polygon room",
  wall: "Wall",
  canopy: "Canopy",
  door: "Door",
  window: "Window",
  gap: "Gap",
  measure: "Measure",
  calibrate: "Calibrate",
  place: "Place",
};

/** Single-key plan tool shortcuts (calibrate and place have none). */
export const TOOL_KEY: Partial<Record<Tool, string>> = {
  select: "V",
  rect: "R",
  room: "P",
  wall: "W",
  canopy: "C",
  door: "D",
  window: "N",
  gap: "G",
  measure: "M",
};

/** A tooltip: "Rectangle room (R)". */
export const tip = (label: string, key?: string): string => (key ? `${label} (${key})` : label);

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "App",
    items: [
      { keys: ["⌘/Ctrl", "K"], action: "Command palette" },
      { keys: ["?"], action: "This shortcut sheet" },
      { keys: ["⌘/Ctrl", "Z"], action: "Undo" },
      { keys: ["⌘/Ctrl", "Shift", "Z"], action: "Redo (or Ctrl+Y)" },
      { keys: ["Tab"], action: "Switch Plan / 3D" },
      { keys: ["1–9"], action: "Floor 1–9" },
      { keys: ["0"], action: "All floors (3D)" },
      { keys: ["Space (hold)"], action: "Show the other layout" },
    ],
  },
  {
    title: "Plan tools",
    items: [
      ...(Object.keys(TOOL_KEY) as Tool[]).map((t) => ({ keys: [TOOL_KEY[t] as string], action: TOOL_LABEL[t] })),
      { keys: ["A"], action: "Add furniture (Furnish)" },
      { keys: ["I"], action: "Floorplan image: off, faint, trace" },
      { keys: ["F"], action: "Fit the rooms" },
      { keys: ["+", "−"], action: "Zoom in, zoom out" },
    ],
  },
  {
    title: "Plan editing",
    items: [
      { keys: ["←", "↑", "→", "↓"], action: "Nudge the selection" },
      { keys: ["Shift", "arrows"], action: "Nudge ten times as far" },
      { keys: ["R"], action: "Turn furniture 90° (when an item is selected)" },
      { keys: ["Shift", "R"], action: "Turn furniture 15°" },
      { keys: ["⌘/Ctrl", "C"], action: "Copy furniture" },
      { keys: ["⌘/Ctrl", "V"], action: "Paste furniture" },
      { keys: ["⌘/Ctrl", "D"], action: "Duplicate furniture" },
      { keys: ["Delete"], action: "Remove the selection (or Backspace)" },
      { keys: ["Esc"], action: "Cancel or deselect" },
      { keys: ["Shift", "click"], action: "Knock a neighbouring room through" },
      { keys: ["Shift", "click"], action: "Add furniture to the selection" },
      { keys: ["drag", "a wall"], action: "Move a selected room's wall (Alt: no snap; Shift: constrain a free wall)" },
      { keys: ["Shift", "drag"], action: "Select furniture in an area" },
      { keys: ["⌘/Ctrl", "click"], action: "Pick one item in a group" },
      { keys: ["⌘/Ctrl", "G"], action: "Group furniture" },
      { keys: ["⌘/Ctrl", "Shift", "G"], action: "Ungroup furniture" },
      { keys: ["⌘/Ctrl", "A"], action: "Select all furniture" },
      { keys: ["double-click"], action: "Turn an item" },
      { keys: ["Alt", "place"], action: "Place furniture freely, without snapping to walls" },
      { keys: ["right-click"], action: "Actions for what's under the pointer" },
      { keys: ["two-finger swipe"], action: "Move around the plan (or drag the background)" },
      { keys: ["pinch"], action: "Zoom the plan (or the mouse wheel)" },
    ],
  },
  {
    title: "3D",
    items: [
      { keys: ["drag"], action: "Orbit" },
      { keys: ["right-drag"], action: "Pan (or Shift-drag)" },
      { keys: ["two-finger swipe"], action: "Pan" },
      { keys: ["pinch"], action: "Zoom (or the mouse wheel, or Ctrl/⌘ + scroll)" },
      { keys: ["right-click"], action: "Actions for the room under the pointer; Walk from here" },
    ],
  },
  {
    title: "Walk",
    items: [
      { keys: ["W", "A", "S", "D"], action: "Walk (or the arrow keys; ← → turn)" },
      { keys: ["Q", "E"], action: "Turn" },
      { keys: ["Shift"], action: "Walk faster" },
      { keys: ["drag"], action: "Look round" },
      { keys: ["click", "floor"], action: "Walk there" },
      { keys: ["click", "door"], action: "Open or shut it" },
      { keys: ["Space (hold)"], action: "Show the other layout" },
      { keys: ["Esc"], action: "Stop walking" },
    ],
  },
];
