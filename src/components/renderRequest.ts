import { create } from "zustand";
import type { CameraPose } from "../lib/cameraViews";

/** A path-traced still someone asked for: which 3D view, from where, and how to name and stamp the file. */
export interface RenderRequest {
  /** Capture id of the viewer to trace ("main", "current", "proposed"). */
  id: string;
  /** A saved view's camera; null traces the camera as it is now. */
  pose: CameraPose | null;
  /** Floor cap to show while tracing (a saved view's); undefined keeps the current one. */
  maxLevel?: number | null;
  /** Names the file and the dialog: the layout or the saved view. */
  label: string;
  /** Add the Storey mark to the saved PNG. */
  stamp: boolean;
}

/** The open Render dialog, if any. Opened from the report's 3D exports, a saved view or the palette. */
export const useRenderRequest = create<{ request: RenderRequest | null; seq: number }>()(() => ({ request: null, seq: 0 }));

export const openRender = (request: RenderRequest): void => useRenderRequest.setState((s) => ({ request, seq: s.seq + 1 }));
export const closeRender = (): void => useRenderRequest.setState({ request: null });
