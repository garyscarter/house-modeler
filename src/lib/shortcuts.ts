export interface Shortcut {
  keys: string[];
  action: string;
}
export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "App",
    items: [
      { keys: ["⌘/Ctrl", "K"], action: "Command palette" },
      { keys: ["?"], action: "This shortcut sheet" },
      { keys: ["⌘/Ctrl", "Z"], action: "Undo" },
      { keys: ["⌘/Ctrl", "Shift", "Z"], action: "Redo (or Ctrl+Y)" },
    ],
  },
  {
    title: "Plan editor",
    items: [
      { keys: ["←", "↑", "→", "↓"], action: "Nudge the selection" },
      { keys: ["Shift", "arrows"], action: "Nudge ten times as far" },
      { keys: ["R"], action: "Turn furniture 90°" },
      { keys: ["Shift", "R"], action: "Turn furniture 15°" },
      { keys: ["⌘/Ctrl", "C"], action: "Copy furniture" },
      { keys: ["⌘/Ctrl", "V"], action: "Paste furniture" },
      { keys: ["⌘/Ctrl", "D"], action: "Duplicate furniture" },
      { keys: ["Delete"], action: "Remove the selection (or Backspace)" },
      { keys: ["Esc"], action: "Cancel or deselect" },
      { keys: ["Shift", "click"], action: "Knock a neighbouring room through" },
      { keys: ["double-click"], action: "Turn an item" },
      { keys: ["Alt", "place"], action: "Place furniture freely, without snapping to walls" },
    ],
  },
  {
    title: "3D view",
    items: [
      { keys: ["drag"], action: "Orbit" },
      { keys: ["right-drag"], action: "Pan (or Shift-drag)" },
      { keys: ["scroll"], action: "Zoom" },
    ],
  },
];
