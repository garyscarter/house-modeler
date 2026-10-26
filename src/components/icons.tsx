import type { ReactNode } from "react";

export type IconName =
  | "select" | "rect" | "polygon" | "wall" | "canopy" | "door" | "window" | "gap" | "measure" | "image" | "walls"
  | "zoomIn" | "zoomOut" | "fit" | "fitImage" | "undo" | "redo" | "search" | "help" | "sun" | "eye" | "compare"
  | "chevronDown" | "chevronRight" | "close" | "circle" | "plus" | "paste" | "house" | "layers" | "info" | "more" | "pencil" | "brush" | "sofa" | "tree" | "clipboard" | "keyboard" | "flower" | "compass";

/** Inline 24-viewBox stroke icons; they take their colour from the text (currentColor). */
const PATHS: Record<IconName, ReactNode> = {
  select: <path d="M5 3l14 7-6 2-2 6z" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1" />,
  polygon: <path d="M12 3l8 6-3 11H7L4 9z" />,
  wall: <><path d="M3 8h18v8H3z" /><path d="M9 8v8M15 8v8" /></>,
  canopy: <><path d="M3 10l9-6 9 6" /><path d="M6 10v9M18 10v9" /></>,
  door: <><path d="M6 20V4h9l3 2v14" /><path d="M3 20h18" /><circle cx="13" cy="12" r=".6" /></>,
  window: <><rect x="5" y="4" width="14" height="16" rx="1" /><path d="M12 4v16M5 12h14" /></>,
  gap: <><path d="M3 12h5M16 12h5" /><path d="M10 8l-2 4 2 4M14 8l2 4-2 4" /></>,
  measure: <><path d="M3 15l12-12 6 6L9 21z" /><path d="M7 11l2 2M10 8l2 2M13 5l2 2" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 9" /></>,
  walls: <><path d="M4 4h16v16H4z" /><path d="M8 8h8v8H8z" /></>,
  zoomIn: <><circle cx="11" cy="11" r="6" /><path d="M16 16l5 5M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="6" /><path d="M16 16l5 5M8 11h6" /></>,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  fitImage: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><path d="M8 16l3-4 2 2 3-4" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M16 16l5 5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17v.1" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  compare: <><rect x="3" y="5" width="8" height="14" rx="1" /><rect x="13" y="5" width="8" height="14" rx="1" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  pencil: <path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3" />,
  circle: <circle cx="12" cy="12" r="8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  paste: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /></>,
  house: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.1" /></>,
  brush: <><path d="M14 4l6 6-8 8H6v-6z" /><path d="M6 18c0 2-1 3-3 3 2 0 4-1 3-3z" /><path d="M12 6l6 6" /></>,
  sofa: <><path d="M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3" /><path d="M3 13a2 2 0 014 0v2h10v-2a2 2 0 014 0v5H3z" /><path d="M5 18v2M19 18v2" /></>,
  tree: <><path d="M12 21v-6" /><path d="M12 3c4 0 7 3 7 6.5S16 15 12 15 5 13 5 9.5 8 3 12 3z" /><path d="M12 11l2-2" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 12h6M9 16h4" /></>,
  flower: <><circle cx="12" cy="9" r="2" /><path d="M12 7a2.5 2.5 0 112.4 3.3M14.4 10.3a2.5 2.5 0 11-1.5 3.6M10.9 13.9a2.5 2.5 0 11-1.3-3.6M9.6 10.3A2.5 2.5 0 1112 7" /><path d="M12 13v8M12 18c-2 0-3.5-1-4-3M12 17c2 0 3.5-1 4-3" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" /></>,
  keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
