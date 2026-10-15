import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Floor, HouseModel } from "../types";
import { buildWalkWorld, displayFloorId, groundY, moveWalker, settleWalker, spawnPoint, type WalkState } from "../lib/walk";

/** Input shared between the walker and its on-screen controls: the joystick, -1..1 with y forward. */
export interface WalkInput {
  joy: { x: number; y: number };
}

export function newWalkInput(): WalkInput {
  return { joy: { x: 0, y: 0 } };
}

const KEYS: Record<string, "fwd" | "back" | "left" | "right" | "run"> = {
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

/** Radians per pixel: dragging grabs the view; a locked mouse turns it. */
const DRAG_LOOK = 0.005;
const LOCK_LOOK = 0.0022;
const MAX_PITCH = 1.35;
/** A press that moves less than this many pixels is a tap. */
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 350;

const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();

/**
 * First-person walking. The walker is a circle that slides along walls and
 * climbs stairs (lib/walk.ts); it reports the floor it is on so the floor
 * selector and floor visibility follow. Desktop: WASD with pointer lock on
 * click, or drag to look without locking. Touch: drag to look, the joystick
 * (WalkControls) to move. Double-tap or double-click a spot to glide there.
 */
export function Walker({
  model,
  floor,
  centre,
  input,
  eye,
  speed,
  coarse,
  onFloor,
  onLock,
}: {
  model: HouseModel;
  /** The floor chosen in the selector; the walker starts there and reports back as it climbs. */
  floor: Floor;
  centre: THREE.Vector3;
  input: WalkInput;
  /** Eye height above the treads, metres. */
  eye: number;
  /** Walking speed, metres per second (doubled with Shift). */
  speed: number;
  coarse: boolean;
  onFloor: (id: string) => void;
  onLock: (locked: boolean) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const raycaster = useThree((s) => s.raycaster);
  const world = useMemo(() => buildWalkWorld(model, eye), [model, eye]);
  const keys = useRef<Record<string, boolean>>({});
  const state = useRef<WalkState | null>(null);
  const look = useRef({ yaw: 0, pitch: 0 });
  const eyeY = useRef<number | null>(null);
  const glide = useRef<{ x: number; y: number; stuck: number } | null>(null);
  /** The floor id we last reported, so the selector echoing it back doesn't respawn us. */
  const reported = useRef<string | null>(null);

  // Start on the chosen floor, unless the change came from climbing the stairs.
  useEffect(() => {
    const st = state.current;
    if (st && floor.id === reported.current && world.floors.has(st.floorId)) {
      // The model changed under us (an edit, or a new eye height): stay put, re-checking the stairs.
      if (st.flight >= world.flights.length) st.flight = -1;
      settleWalker(world, st);
      return;
    }
    const { at, look: target } = spawnPoint(floor, { x: centre.x, y: centre.z });
    state.current = settleWalker(world, { x: at.x, y: at.y, floorId: floor.id, flight: -1 });
    look.current = { yaw: Math.atan2(-(target.x - at.x), -(target.y - at.y)), pitch: 0 };
    eyeY.current = null;
    glide.current = null;
    reported.current = floor.id;
  }, [floor, centre, world]);

  // Keyboard.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    };
    const down = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k || typing(e) || e.ctrlKey || e.metaKey) return;
      keys.current[k] = true;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) keys.current[k] = false;
    };
    const blur = () => (keys.current = {});
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Pointer: drag to look, tap twice to glide, click to lock the mouse (desktop only).
  useEffect(() => {
    const el = gl.domElement;
    const drags = new Map<number, { x: number; y: number; sx: number; sy: number; moved: boolean }>();
    let lastTap = { t: -Infinity, x: 0, y: 0 };
    let lockTimer = 0;
    const locked = () => document.pointerLockElement === el;
    const turn = (dyaw: number, dpitch: number) => {
      const l = look.current;
      l.yaw += dyaw;
      l.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, l.pitch + dpitch));
    };

    const glideTo = (clientX: number, clientY: number) => {
      const st = state.current;
      if (!st) return;
      const r = el.getBoundingClientRect();
      _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(_ndc, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && h.distance < 40);
      if (!hit) return;
      // On a wall or furniture, stop just short of it; collision does the rest.
      _hit.copy(hit.point);
      if (hit.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y < 0.7) {
        _hit.x -= raycaster.ray.direction.x * 0.3;
        _hit.z -= raycaster.ray.direction.z * 0.3;
      }
      glide.current = { x: _hit.x, y: _hit.z, stuck: 0 };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (locked()) return;
      drags.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (locked()) {
        turn(-e.movementX * LOCK_LOOK, -e.movementY * LOCK_LOOK);
        return;
      }
      const d = drags.get(e.pointerId);
      if (!d) return;
      turn((e.clientX - d.x) * DRAG_LOOK, (e.clientY - d.y) * DRAG_LOOK);
      d.x = e.clientX;
      d.y = e.clientY;
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > TAP_SLOP) d.moved = true;
    };
    const onUp = (e: PointerEvent) => {
      const d = drags.get(e.pointerId);
      drags.delete(e.pointerId);
      if (!d || d.moved) return;
      // Event time, not handling time: a slow frame must not split a double-tap.
      const now = e.timeStamp;
      if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
        window.clearTimeout(lockTimer);
        lastTap = { t: -Infinity, x: 0, y: 0 };
        glideTo(e.clientX, e.clientY);
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      // A single click locks the mouse for WASD-and-look, after waiting to see if it is a double-click.
      if (e.pointerType === "mouse" && !coarse) {
        window.clearTimeout(lockTimer);
        lockTimer = window.setTimeout(() => {
          const p = el.requestPointerLock?.() as Promise<void> | undefined;
          p?.catch?.(() => {});
        }, DOUBLE_TAP_MS);
      }
    };
    const onCancel = (e: PointerEvent) => drags.delete(e.pointerId);
    const onLockChange = () => onLock(locked());

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      window.clearTimeout(lockTimer);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("pointerlockchange", onLockChange);
      if (locked()) document.exitPointerLock();
      onLock(false);
    };
  }, [gl, camera, scene, raycaster, coarse, onLock]);


  // Scripted checks in development read and place the walker.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, { __walker: { state, look, camera, glide, scene, raycaster } });
  }, [camera, scene, raycaster]);

  useFrame((_, delta) => {
    const st = state.current;
    if (!st) return;
    // Cap the step so a stalled frame does not fling the walker (collision still holds either way).
    const dt = Math.min(delta, 0.1);
    const k = keys.current;
    const { yaw, pitch } = look.current;
    // Camera looks down -z at yaw 0.
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let f = (k.fwd ? 1 : 0) - (k.back ? 1 : 0) + input.joy.y;
    let s = (k.right ? 1 : 0) - (k.left ? 1 : 0) + input.joy.x;
    const mag = Math.hypot(f, s);
    if (mag > 1) {
      f /= mag;
      s /= mag;
    }
    const step = speed * (k.run ? 2 : 1) * dt;
    if (mag > 0.05) {
      glide.current = null;
      moveWalker(world, st, (fx * f - fz * s) * step, (fz * f + fx * s) * step);
    } else if (glide.current) {
      const g = glide.current;
      const dx = g.x - st.x;
      const dz = g.y - st.y;
      const dist = Math.hypot(dx, dz);
      const want = Math.min(dist, step);
      const px = st.x;
      const pz = st.y;
      if (want > 1e-4) moveWalker(world, st, (dx / dist) * want, (dz / dist) * want);
      // Give up once there, or when a wall stops progress.
      const got = Math.hypot(st.x - px, st.y - pz);
      g.stuck = got < want * 0.3 ? g.stuck + 1 : 0;
      if (dist < 0.05 || g.stuck > 8) glide.current = null;
    }

    const shown = displayFloorId(world, st);
    if (shown !== reported.current) {
      reported.current = shown;
      onFloor(shown);
    }

    // Ease the eye up and down the stairs.
    const target = groundY(world, st) + eye;
    eyeY.current = eyeY.current === null ? target : eyeY.current + (target - eyeY.current) * (1 - Math.exp(-dt * 12));
    camera.position.set(st.x, eyeY.current, st.y);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  });

  return null;
}
