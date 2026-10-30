import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { HouseModel, VariantKey } from "../../types";
import { useStore } from "../../store";
import { useWalk } from "../../walkStore";
import { siteOf } from "../../lib/sites";
import { keyBelongsElsewhere } from "../../lib/nudge";
import { buildNav, goalPoint, initialDoors, pickTarget, planTour, roomAt, routeTo, settle, startPose, stepWalker } from "../../lib/walk";
import { eyeHeightOf, type NavWorld, type WalkPoint, type WalkPose, type WalkRoute } from "../../lib/walkTypes";
import { anyKey, dragLook, followRoute, isTap, keyIntent, keyMotionActive, keyMove, lookSweep, NO_KEY_MOTION, NO_KEYS, REST_PITCH, routePointS, routeStart, springValue, stopBeforeDoor, walkFov, type HeldKeys, type KeyMotion, type RouteState } from "../../lib/walkMotion";
import { doorTagOf } from "./doorTag";

/** First-person walk controller (docs/walkthrough-plan.md, Chunk C): keys, drag to look, tap to walk or open a door, routes and the tour. */

const NEAR = 0.05;
const DRAG_PX = 6;
const RING_S = 1.6;
const LOOK_S = 6;
const DOOR_REACH_M = 1.8; // a tour opens a shut door this far off (the leaf takes 0.7 s to swing)
const DOOR_OPEN_S = 0.8;
const DOOR_SLOW_M = 1.0;
const DOOR_SLOW_SPEED = 0.7;
const STALL_S = 0.5;
const COARSE = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;
let hinted = false;

/** A route being walked; `arrive` runs once the walker is there and facing the route's yaw. */
interface Follow { route: WalkRoute; rs: RouteState; goal: WalkPoint | null; arrive?: () => void }

export function WalkControls({ model, variant }: { model: HouseModel; variant: VariantKey }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const site = useStore((s) => siteOf(s.sites, variant));
  const doorsOpen = useStore((s) => s.doorsOpen);
  const nav = useMemo(() => buildNav(model, site, !!doorsOpen), [model, site, doorsOpen]);
  const navRef = useRef<NavWorld>(nav);
  navRef.current = nav;
  const inv = useRef(invalidate);
  inv.current = invalidate;

  // ---- state kept outside React ----
  const poseRef = useRef<WalkPose | null>(useWalk.getState().pose);
  const lastSet = useRef<WalkPose | null>(poseRef.current);
  const smoothY = useRef(poseRef.current?.feetY ?? 0);
  const keys = useRef<HeldKeys>({ ...NO_KEYS });
  const follow = useRef<Follow | null>(null);
  const lookVel = useRef({ yaw: 0, pitch: 0 });
  const keyMotion = useRef<KeyMotion>(NO_KEY_MOTION);
  const yawVel = useRef(0);
  const pitchVel = useRef(0);
  const doorTimers = useRef(new Map<string, number>());
  const stall = useRef({ t: 0, count: 0 });
  const tourRef = useRef({ routeFor: -1, lookT: 0, prev: "off" as string });
  const ring = useRef<THREE.Mesh>(null);
  const ringT = useRef(0);
  const fovRad = useRef((walkFov(1.6) * Math.PI) / 180);

  const commit = (p: WalkPose) => {
    poseRef.current = p;
    lastSet.current = p;
    const w = useWalk.getState();
    w.setPose(p);
    const r = roomAt(navRef.current, p.level, { x: p.x, y: p.y });
    w.setWhere({ level: p.level, roomName: r?.name ?? null, outside: p.level === 0 && !r });
  };

  const showRing = (x: number, y: number, z: number) => {
    const m = ring.current;
    if (!m) return;
    m.position.set(x, y + 0.03, z);
    ringT.current = RING_S;
    m.visible = true;
    inv.current();
  };
  const takeOver = () => {
    const w = useWalk.getState();
    if (w.tour.status === "playing") w.pauseTour();
  };
  const shutHint = () => useWalk.getState().say(`The door's shut — ${COARSE() ? "tap" : "click"} it to open`);
  const startRoute = (route: WalkRoute, goal: WalkPoint | null, resetStall = true, arrive?: () => void) => {
    const p = poseRef.current;
    // The new route starts from here; the view's turning speed (yawVel) carries over, so nothing jumps.
    follow.current = { route, rs: routeStart(p ?? { x: route.points[0]?.x ?? 0, y: route.points[0]?.y ?? 0, yaw: 0 }, route), goal, arrive };
    if (resetStall) stall.current = { t: 0, count: 0 };
    useWalk.getState().setRoute(route);
    inv.current();
  };
  const clearRoute = () => {
    follow.current = null;
    if (useWalk.getState().route) useWalk.getState().setRoute(null);
  };
  /** Route to a point, as a tap or the mini-map asks. */
  const goTo = (point: WalkPoint, yaw: number | undefined, ring3: { x: number; y: number; z: number }) => {
    const p = poseRef.current;
    if (!p) return;
    const w = useWalk.getState();
    const res = routeTo(navRef.current, p, point, w.doors);
    if (res.ok) {
      startRoute(yaw !== undefined ? { ...res.route, yaw } : res.route, point);
      showRing(ring3.x, ring3.y, ring3.z);
    } else if (res.reason === "shut-door") {
      // Walk up to the shut door and say so there, as you would find it.
      const door = navRef.current.doors.find((d) => d.key === res.door);
      const part = door && stopBeforeDoor(res.route, door, { x: p.x, y: p.y, level: p.level, stair: p.stair });
      const stop = part?.points[part.points.length - 1];
      if (part && stop && Math.hypot(stop.x - p.x, stop.y - p.y) > 0.3) startRoute(part, null, true, shutHint);
      else shutHint();
    } else {
      w.say("Can't get there from here");
    }
  };

  // ---- one update, shared by the frame loop and __walk.sim; true while anything is still moving ----
  const step = (dt: number): boolean => {
    let p = poseRef.current;
    if (!p) return false;
    const w = useWalk.getState();
    const n = navRef.current;
    let busy = false;
    let { yaw, pitch } = p;
    let dx = 0;
    let dy = 0;
    let intended = 0;
    let followed = false;

    // Tour bookkeeping.
    const tour = w.tour;
    const tr = tourRef.current;
    if (tour.status !== "playing") {
      if (tr.prev === "playing" && follow.current && tr.routeFor >= 0) clearRoute();
      tr.routeFor = -1;
    } else if (tr.prev !== "playing" && tour.stops.length) {
      // Playing again replans from where you stand.
      tr.routeFor = -1;
      if (tour.phase === "looking") w.setTour({ phase: "walking" });
    }
    tr.prev = tour.status;

    // Keys.
    const held = keys.current;
    if (anyKey(held) || keyMotionActive(keyMotion.current)) {
      const km = keyMove(held, yaw, dt, keyMotion.current);
      keyMotion.current = km.motion;
      dx += km.dx;
      dy += km.dy;
      yaw += km.dyaw;
      busy = true;
    }

    // Doors the tour opened a moment ago are still swinging: slow down near them.
    const timers = doorTimers.current;
    let cap = Infinity;
    for (const [key, left] of timers) {
      if (left <= dt) timers.delete(key);
      else timers.set(key, left - dt);
      const nd = n.doors.find((x) => x.key === key);
      if (nd && Math.hypot(nd.centre.x - p.x, nd.centre.y - p.y) < DOOR_SLOW_M) cap = DOOR_SLOW_SPEED;
    }
    let looking = false;
    const runRoute = (f: Follow) => {
      const r = followRoute({ x: p!.x, y: p!.y, yaw, pitch }, f.route, f.rs, { yawVel: yawVel.current, pitchVel: pitchVel.current }, dt, cap);
      f.rs = r.state;
      dx += r.dx;
      dy += r.dy;
      yaw = r.yaw;
      pitch = r.pitch;
      yawVel.current = r.yawVel;
      pitchVel.current = r.pitchVel;
      intended = r.intended;
      followed = true;
      return r;
    };

    if (tour.status === "playing") {
      busy = true;
      if (!tour.stops.length) {
        const stops = planTour(n, p, w.doors);
        if (!stops.length) {
          w.stopTour();
          w.say("That's the tour");
        } else w.setTour({ stops, index: 0, phase: "walking" });
      } else {
        const stop = tour.stops[tour.index];
        if (!stop) {
          w.stopTour();
          w.say("That's the tour");
        } else if (tour.phase === "walking") {
          if (tr.routeFor !== tour.index) {
            tr.routeFor = tour.index;
            const goal: WalkPoint = { x: stop.at.x, y: stop.at.y, level: stop.level, stair: null };
            const res = routeTo(n, p, goal, w.doors);
            const route = res.ok ? res.route : res.reason === "shut-door" ? res.route : null;
            if (route) startRoute({ ...route, yaw: stop.yaw }, goal);
            else {
              clearRoute();
              w.setTour({ index: tour.index + 1 });
              tr.routeFor = -1;
            }
          }
          const f = follow.current;
          if (f) {
            // Open a shut door on the route as we near it, without stopping.
            for (const d of f.route.doors) {
              if (routePointS(f.rs, d.index) < f.rs.s || w.doors[d.key] !== false) continue;
              const nd = n.doors.find((x) => x.key === d.key);
              if (nd && Math.hypot(nd.centre.x - p.x, nd.centre.y - p.y) < DOOR_REACH_M) {
                w.setDoor(d.key, true);
                timers.set(d.key, DOOR_OPEN_S);
              }
            }
            const r = runRoute(f);
            if (r.done) {
              clearRoute();
              tr.lookT = 0;
              w.setTour({ phase: "looking" });
            }
          } else if (tr.routeFor === tour.index && tour.phase === "walking" && !follow.current) {
            tr.lookT = 0;
            w.setTour({ phase: "looking" });
          }
        } else {
          tr.lookT += dt;
          looking = true;
          yaw = lookSweep(stop.yaw, tr.lookT, LOOK_S);
          const ps = springValue(pitch, pitchVel.current, REST_PITCH, dt, 8);
          pitch = ps.x;
          pitchVel.current = ps.vel;
          if (tr.lookT >= LOOK_S) {
            tr.routeFor = -1;
            if (tour.index + 1 >= tour.stops.length) {
              w.stopTour();
              w.say("That's the tour");
            } else w.setTour({ index: tour.index + 1, phase: "walking" });
          }
        }
      }
    } else if (follow.current) {
      busy = true;
      const f = follow.current;
      const r = runRoute(f);
      // Done once stopped there and turned to the way the route asks you to face.
      if (r.done) {
        clearRoute();
        f.arrive?.();
      }
    }
    if (!followed) {
      yawVel.current = 0;
      if (!looking) pitchVel.current = 0;
    }

    // Look inertia after a drag.
    const lv = lookVel.current;
    if (Math.abs(lv.yaw) > 0.01 || Math.abs(lv.pitch) > 0.01) {
      yaw += lv.yaw * dt;
      pitch = Math.max(-1.35, Math.min(1.35, pitch + lv.pitch * dt));
      const k = Math.exp(-5 * dt);
      lv.yaw *= k;
      lv.pitch *= k;
      busy = true;
    } else lv.yaw = lv.pitch = 0;

    // Move.
    const before = p;
    if (dx || dy) {
      p = stepWalker(n, p, dx, dy, w.doors);
      // Not moved at all: stood where nobody can (a door shut on you, an edit); step to the nearest free spot.
      if (p.x === before.x && p.y === before.y) p = settle(n, p, w.doors);
    }
    if (yaw !== p.yaw || pitch !== p.pitch) p = { ...p, yaw, pitch };
    // A route that makes no progress is replanned once, then reported.
    if (followed && follow.current && intended > 1e-6) {
      const got = Math.hypot(p.x - before.x, p.y - before.y);
      stall.current.t = got < intended * 0.2 ? stall.current.t + dt : 0;
      if (stall.current.t > STALL_S) {
        stall.current.t = 0;
        stall.current.count++;
        const goal = follow.current.goal;
        const inTour = useWalk.getState().tour.status === "playing";
        if (stall.current.count === 1 && goal) {
          const res = routeTo(n, p, goal, useWalk.getState().doors);
          if (res.ok) startRoute({ ...res.route, yaw: follow.current.route.yaw }, goal, false);
          else if (res.reason === "shut-door" && inTour) {
            useWalk.getState().setDoor(res.door, true);
            startRoute({ ...res.route, yaw: follow.current.route.yaw }, goal, false);
          } else {
            clearRoute();
            if (res.reason === "shut-door") shutHint();
            else useWalk.getState().say("Can't get there from here");
          }
        } else {
          clearRoute();
          if (inTour) {
            tr.lookT = 0;
            useWalk.getState().setTour({ phase: "looking" });
          } else shutHint();
        }
      }
    }
    if (p !== poseRef.current) {
      const moved = p.x !== poseRef.current!.x || p.y !== poseRef.current!.y || p.yaw !== poseRef.current!.yaw || p.pitch !== poseRef.current!.pitch || p.feetY !== poseRef.current!.feetY || p.level !== poseRef.current!.level;
      if (moved) commit(p);
      else poseRef.current = p;
    }
    // Eye height eases so a door step does not jolt.
    const dyEye = p.feetY - smoothY.current;
    if (Math.abs(dyEye) > 0.002) {
      smoothY.current += dyEye * (1 - Math.exp(-12 * dt));
      busy = true;
    } else smoothY.current = p.feetY;
    return busy;
  };

  const applyCamera = () => {
    const p = poseRef.current;
    if (!p) return;
    const eye = eyeHeightOf(useStore.getState().settings);
    camera.position.set(p.x, smoothY.current + eye, p.y);
    camera.rotation.set(p.pitch, p.yaw, 0);
  };

  const ringStep = (dt: number) => {
    const m = ring.current;
    if (!m) return false;
    if (ringT.current > 0) {
      ringT.current = Math.max(0, ringT.current - dt);
      const a = ringT.current / RING_S;
      (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * a;
      m.scale.setScalar(1 + (1 - a) * 0.6);
      if (ringT.current === 0) m.visible = false;
      return ringT.current > 0;
    }
    return false;
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const busy = step(dt);
    const ringBusy = ringStep(dt);
    applyCamera();
    if (busy || ringBusy) inv.current();
  });

  // ---- camera lens ----
  useEffect(() => {
    camera.rotation.order = "YXZ";
    camera.near = NEAR;
    camera.fov = walkFov(size.width / Math.max(1, size.height));
    fovRad.current = (camera.fov * Math.PI) / 180;
    camera.updateProjectionMatrix();
    inv.current();
  }, [camera, size.width, size.height]);
  useEffect(
    () => () => {
      camera.fov = 45;
      camera.near = 0.1;
      camera.rotation.order = "XYZ";
      camera.updateProjectionMatrix();
    },
    [camera],
  );
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __houseCamera: { camera, controls: null } });
  }, [camera]);

  // ---- placing the walker, and following a layout change ----
  const pending = useWalk((s) => s.pending);
  useEffect(() => {
    if (!pending) return;
    const pose = { ...startPose(nav, pending), pitch: REST_PITCH };
    clearRoute();
    keyMotion.current = NO_KEY_MOTION;
    yawVel.current = 0;
    pitchVel.current = 0;
    useWalk.getState().placed(pose, initialDoors(nav));
    smoothY.current = pose.feetY;
    commit(pose);
    applyCamera();
    if (!hinted) {
      hinted = true;
      useWalk.getState().say(COARSE() ? "Tap the floor to walk · drag to look round · tap a door to open it" : "Click the floor to walk · drag to look · WASD or arrows to move · Esc to stop", 6000);
    }
    inv.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);
  const navSeen = useRef(nav);
  useEffect(() => {
    if (navSeen.current === nav) return;
    navSeen.current = nav;
    const w = useWalk.getState();
    const p = poseRef.current;
    if (w.pending || !p) return;
    w.mergeDoors(initialDoors(nav));
    clearRoute();
    if (w.tour.status === "playing") w.pauseTour();
    commit(settle(nav, p, useWalk.getState().doors));
    inv.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);
  // Someone else (the mini-map, a test) placed the walker.
  useEffect(
    () =>
      useWalk.subscribe((s, prev) => {
        if (s.pose && s.pose !== lastSet.current) {
          poseRef.current = s.pose;
          lastSet.current = s.pose;
          if (!prev.pose || prev.pose.level !== s.pose.level || Math.abs(prev.pose.feetY - s.pose.feetY) > 1) smoothY.current = s.pose.feetY;
          inv.current();
        }
        if (s.route !== prev.route && s.route !== (follow.current?.route ?? null)) {
          follow.current = s.route && poseRef.current ? { route: s.route, rs: routeStart(poseRef.current, s.route), goal: s.route.points[s.route.points.length - 1] ?? null } : null;
          inv.current();
        }
        if (s.tour.status !== prev.tour.status || s.doors !== prev.doors || s.doorsSettled !== prev.doorsSettled) inv.current();
      }),
    [],
  );

  // ---- mini-map goals ----
  useEffect(() => {
    const take = () => {
      const w = useWalk.getState();
      if (!w.goal || !poseRef.current) return;
      const g = w.takeGoal();
      if (!g) return;
      takeOver();
      const gp = goalPoint(navRef.current, g);
      if (!gp) {
        w.say("Can't get there from here");
        return;
      }
      const base = navRef.current.levels.find((l) => l.level === gp.point.level)?.baseY ?? 0;
      goTo(gp.point, gp.yaw, { x: gp.point.x, y: base, z: gp.point.y });
    };
    take();
    return useWalk.subscribe((s, prev) => {
      if (s.goal && s.goal !== prev.goal) take();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keys ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (keyBelongsElsewhere(e.target, document)) return;
      const intent = keyIntent(e.code);
      if (intent) {
        e.preventDefault();
        e.stopPropagation();
        if (!keys.current[intent]) {
          keys.current[intent] = true;
          if (intent !== "fast") {
            takeOver();
            clearRoute();
          }
        }
        inv.current();
      } else if (/^Digit\d$/.test(e.code) || e.code === "KeyM") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const up = (e: KeyboardEvent) => {
      const intent = keyIntent(e.code);
      if (intent) keys.current[intent] = false;
    };
    const blur = () => {
      keys.current = { ...NO_KEYS };
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || keyBelongsElsewhere(e.target, document)) return;
      useWalk.getState().stopWalk();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", esc);
    };
  }, []);

  // ---- pointer: drag to look, tap to walk or open a door ----
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const normal = new THREE.Vector3();
    const hidden = (o: THREE.Object3D | null) => {
      for (; o; o = o.parent) if (!o.visible) return true;
      return false;
    };
    const matOf = (h: THREE.Intersection): THREE.Material | undefined => {
      const m = (h.object as THREE.Mesh).material;
      return Array.isArray(m) ? m[h.face?.materialIndex ?? 0] : m;
    };
    const tap = (clientX: number, clientY: number) => {
      const p = poseRef.current;
      if (!p) return;
      const r = el.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
      camera.updateMatrixWorld();
      ray.setFromCamera(ndc, camera);
      takeOver();
      const hits = ray.intersectObjects(scene.children, true);
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__walkHits = hits.slice(0, 8).map((h) => ({ n: h.object.name, t: h.object.type, tr: !!matOf(h)?.transparent, side: matOf(h)?.side, ny: h.face ? +normal.copy(h.face.normal).transformDirection(h.object.matrixWorld).y.toFixed(2) : null, d: +h.distance.toFixed(2), y: +h.point.y.toFixed(2) }));
      for (const h of hits) {
        if (!(h.object as THREE.Mesh).isMesh || hidden(h.object)) continue;
        const tag = doorTagOf(h.object);
        if (tag) {
          useWalk.getState().toggleDoor(tag.key, tag.initial);
          inv.current();
          return;
        }
        const mat = matOf(h);
        if (!mat || mat.transparent || mat.visible === false || mat.side === THREE.BackSide) continue;
        if (!h.face) continue;
        normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        if (normal.y > 0.6) {
          const target = pickTarget(navRef.current, { x: h.point.x, y: h.point.y, z: h.point.z }, p);
          if (!target) useWalk.getState().say("Can't get there from here");
          else goTo(target, undefined, { x: h.point.x, y: h.point.y, z: h.point.z });
        }
        return;
      }
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let g: { id: number; x: number; y: number; t: number; lx: number; ly: number; lt: number; dragging: boolean; dead: boolean } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g || pointers.size > 1) {
        if (g) g.dead = true;
        return;
      }
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX, ly: e.clientY, lt: performance.now(), dragging: false, dead: false };
      lookVel.current = { yaw: 0, pitch: 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer */
      }
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.dead) return;
      if (!g.dragging && Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_PX) return;
      const p = poseRef.current;
      if (!p) return;
      if (!g.dragging) {
        g.dragging = true;
        takeOver();
        el.style.cursor = "grabbing";
      }
      const now = performance.now();
      const ddx = e.clientX - g.lx;
      const ddy = e.clientY - g.ly;
      const r = el.getBoundingClientRect();
      const look = dragLook(p.yaw, p.pitch, ddx, ddy, fovRad.current, r.height);
      const dtS = Math.max(0.008, (now - g.lt) / 1000);
      const k = fovRad.current / Math.max(1, r.height);
      lookVel.current = { yaw: (ddx * k) / dtS, pitch: (ddy * k) / dtS };
      g.lx = e.clientX;
      g.ly = e.clientY;
      g.lt = now;
      commit({ ...p, yaw: look.yaw, pitch: look.pitch });
      inv.current();
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (!g || e.pointerId !== g.id) return;
      const cur = g;
      g = null;
      el.style.cursor = "";
      if (cur.dead) return;
      const now = performance.now();
      if (!cur.dragging && isTap({ x: cur.x, y: cur.y, t: cur.t }, { x: e.clientX, y: e.clientY, t: now })) tap(e.clientX, e.clientY);
      else if (cur.dragging && now - cur.lt > 90) lookVel.current = { yaw: 0, pitch: 0 };
      inv.current();
    };
    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (g && e.pointerId === g.id) {
        g = null;
        el.style.cursor = "";
      }
    };
    const ctx = (e: Event) => e.preventDefault();
    const wheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("contextmenu", ctx);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("contextmenu", ctx);
      el.removeEventListener("wheel", wheel);
      el.style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  // ---- dev hook for the Playwright checks ----
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const sim = (seconds: number): WalkPose[] => {
      const out: WalkPose[] = [];
      const n = Math.max(1, Math.round(seconds * 30));
      for (let i = 0; i < n; i++) {
        step(1 / 30);
        ringStep(1 / 30);
        if (poseRef.current) out.push({ ...poseRef.current });
      }
      applyCamera();
      inv.current();
      return out;
    };
    Object.assign(window, { __walk: { nav: () => navRef.current, sim } });
    return () => {
      delete (window as unknown as { __walk?: unknown }).__walk;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={5} raycast={() => null}>
      <ringGeometry args={[0.18, 0.26, 40]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
