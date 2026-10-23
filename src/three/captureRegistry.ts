import { useSyncExternalStore } from "react";
import type * as THREE from "three";

/**
 * Which 3D viewers are on screen, for the export buttons. Kept apart from
 * capture.ts (and free of runtime three.js imports) so the report panel can
 * list the views without pulling the 3D libraries into the app shell; the
 * capture functions themselves load with the 3D view.
 */
export interface CaptureTarget {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

const registry = new Map<string, CaptureTarget>();
const listeners = new Set<() => void>();
let ids: string[] = [];
const changed = () => {
  ids = [...registry.keys()];
  listeners.forEach((l) => l());
};

export function registerCapture(id: string, target: CaptureTarget): () => void {
  registry.set(id, target);
  changed();
  return () => {
    if (registry.get(id) === target) registry.delete(id);
    changed();
  };
}

/** The registered viewer with this id, or the first one. */
export function getCapture(id?: string): CaptureTarget | undefined {
  if (id) return registry.get(id);
  return registry.values().next().value;
}

/** Ids of the 3D viewers on screen ("main", or "current" and "proposed" side by side), for the export buttons. */
export function useCaptureIds(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ids,
  );
}
