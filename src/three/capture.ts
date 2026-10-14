import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";

export interface CaptureTarget {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

const registry = new Map<string, CaptureTarget>();

/** Registers a viewer's renderer, scene and camera so exports can reach them. */
export function CaptureBridge({ id }: { id: string }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    registry.set(id, { gl, scene, camera });
    return () => {
      registry.delete(id);
    };
  }, [id, gl, scene, camera]);
  return null;
}

/** The registered viewer with this id, or the first one. */
export function getCapture(id?: string): CaptureTarget | undefined {
  if (id) return registry.get(id);
  return registry.values().next().value;
}
