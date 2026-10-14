import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import type { Floor, HouseModel } from "../types";
import { floorBaseY } from "./House";
import { pointInPolygon, polygonArea, polygonCentroid, roomWorldPolygon, toWorld } from "../lib/geometry";

const KEYS: Record<string, string> = {
  KeyW: "fwd",
  ArrowUp: "fwd",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
};

export function Walker({
  model,
  floor,
  centre,
  onLock,
}: {
  model: HouseModel;
  floor: Floor;
  centre: THREE.Vector3;
  onLock: (v: boolean) => void;
}) {
  const camera = useThree((s) => s.camera);
  const keys = useRef<Record<string, boolean>>({});
  const eye = floorBaseY(model, floor) + 1.6;

  useEffect(() => {
    // Start in the middle of the largest room on this floor, facing its
    // nearest door (or the floor's centre if it has none).
    let start = { x: centre.x, y: centre.z };
    let bestPoly: ReturnType<typeof roomWorldPolygon> | null = null;
    let best = 0;
    for (const room of floor.rooms) {
      const poly = roomWorldPolygon(floor, room);
      const a = Math.abs(polygonArea(poly));
      if (a > best) {
        best = a;
        start = polygonCentroid(poly);
        bestPoly = poly;
      }
    }
    let target = { x: centre.x, y: centre.z };
    let bestD = Infinity;
    for (const op of floor.openings) {
      if (op.kind !== "door") continue;
      const p = toWorld(floor, { x: op.x, y: op.y });
      const d = Math.hypot(p.x - start.x, p.y - start.y);
      // Doors on this room's boundary are within a wall-width of its polygon.
      const near = bestPoly && (pointInPolygon(p, bestPoly) || d < 6);
      if (near && d < bestD) {
        bestD = d;
        target = p;
      }
    }
    if (Math.hypot(target.x - start.x, target.y - start.y) < 0.1) target = { x: start.x + 1, y: start.y };
    camera.position.set(start.x, eye, start.y);
    camera.lookAt(target.x, eye, target.y);
    const down = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) {
        keys.current[k] = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) keys.current[k] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera, centre, eye, floor]);

  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.run ? 4 : 2) * Math.min(dt, 0.05);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (k.fwd) camera.position.addScaledVector(dir, speed);
    if (k.back) camera.position.addScaledVector(dir, -speed);
    if (k.left) camera.position.addScaledVector(side, -speed);
    if (k.right) camera.position.addScaledVector(side, speed);
    camera.position.y = eye;
  });

  // Restrict pointer lock to the 3D canvas; by default drei locks on any document click.
  return <PointerLockControls makeDefault selector=".viewer canvas" onLock={() => onLock(true)} onUnlock={() => onLock(false)} />;
}
