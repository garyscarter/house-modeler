import { isValidPose } from "../lib/cameraViews";
import type { Pose } from "./cameraLink";

const KEY = "house-modeler-camera";

/** The camera pose remembered from the last visit, or null. */
export function loadCameraPose(): Pose | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return isValidPose(p) ? { position: p.position, target: p.target } : null;
  } catch {
    return null;
  }
}

export function saveCameraPose(p: Pose): void {
  if (!isValidPose(p)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ position: p.position, target: p.target }));
  } catch {
    // Storage blocked: the camera just won't be remembered.
  }
}
