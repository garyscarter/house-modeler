import type { ViewRequest } from "../lib/cameraViews";

/** Ask every 3D view to look at a side or go home; the same as clicking that face of the view cube. */
export function requestView(side: ViewRequest) {
  window.dispatchEvent(new CustomEvent("house:view", { detail: { side } }));
}
