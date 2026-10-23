import { useStore } from "../store";
import { lastPose } from "../three/cameraLink";
import { requestPose } from "../three/viewRequest";
import { cleanViewName, makeSavedView, nextViewName } from "../lib/savedViews";
import type { SavedView } from "../types";

export const frames = (n: number): Promise<void> => new Promise((r) => (n <= 0 ? r() : requestAnimationFrame(() => frames(n - 1).then(r))));

/** Show the 3D view at a saved camera and floor cap. */
export async function goToSavedView(v: SavedView) {
  const st = useStore.getState();
  const wasThreeD = st.tab === "3d";
  st.setUi({ tab: "3d", maxLevel: v.maxLevel ?? null });
  // A viewer that is only just mounting needs a moment before it listens for the request.
  if (!wasThreeD) await frames(2);
  requestPose(v);
}

/** Save the camera as it is now; returns the new view, or null when no 3D view has been shown yet. */
export function saveCurrentView(name?: string): SavedView | null {
  const pose = lastPose();
  if (!pose) return null;
  const st = useStore.getState();
  const view = makeSavedView(pose, cleanViewName(name ?? "", nextViewName(st.savedViews)), st.maxLevel);
  st.addSavedView(view);
  return view;
}

/** Replace a saved view's camera (and floor cap) with the current ones. */
export function updateViewToCurrent(id: string): boolean {
  const pose = lastPose();
  if (!pose) return false;
  const st = useStore.getState();
  st.updateSavedView(id, { position: pose.position, target: pose.target, maxLevel: st.maxLevel });
  return true;
}
