import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { useStore } from "../../store";
import { currentQuality } from "../useQuality";
import type { HouseModel } from "../../types";
import { useSunInfo } from "../useSun";
import { floorBaseY } from "../floorBase";
import { controlIndex } from "../../lib/electrics";
import { pointInPolygon } from "../../lib/geometry";
import { floorLamps, lightsMaster, lightsOn as masterAllows, switchedOn, type LampLight } from "../../lib/lights";
import { walkAdaptOf } from "../../lib/walkTypes";
import {
  EXPOSURE_START, METER_EVERY, easeExposure, exposureBusy, exposureFactor, glazingFraction, lampTerm, meter, panesOf, skyLevel, targetEV,
  type Exposure,
} from "../../lib/walkExposure";
import { registerWalkTerm, type WalkTermCtx } from "./walkTerms";

/** Exposure multiplier per renderer, read by the ExposureEffect (high) each frame. Absent = 1. */
export const exposureByRenderer = new WeakMap<THREE.WebGLRenderer, { factor: number }>();

/** Outdoors the sky fills the view: metered as a room that is all glass, with no lamps. */
const OUTSIDE_AREA = 20;

interface Metered { sky: number; lamps: number; glazing: number; L: number; alt: number | null; mode: string; roomId: string | null }

/**
 * Eyes adjust: while walking, meters the room the walker stands in (its glazing, the sky, its lit lamps, the glass in
 * view) a few times a second, and eases an exposure that brightens fast and darkens slowly, only part of the way
 * (src/lib/walkExposure.ts). The factor goes to the ExposureEffect on high and to toneMappingExposure on balanced and
 * low. Mounted only while walking in the main view, so orbit, the plan and stills stay at exposure 1.
 */
export function WalkExposure({ model }: { model: HouseModel }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const sun = useSunInfo();
  const altitude = sun?.active ? sun.position.altitude : null;
  const altRef = useRef(altitude);
  altRef.current = altitude;
  // The eye menu is DOM outside the Canvas, so a mode change has to wake the demand loop itself.
  const adaptMode = useStore((s) => walkAdaptOf(s.settings));
  useEffect(() => invalidate(), [adaptMode, invalidate]);

  // Lit lamps by floor, as House lights them: the master, wall switches and the sun. Rebuilt only when those change.
  const master = useStore((s) => lightsMaster(s.sun));
  const lampsOn = masterAllows(master, altitude);
  const blockedKey = useMemo(() => [...controlIndex(model)].filter(([, sws]) => sws.some((c) => !c.on)).map(([id]) => id).sort().join(), [model]);
  const lampsByFloor = useMemo(() => {
    const out = new Map<string, LampLight[]>();
    if (!lampsOn) return out;
    const blocked = new Set(blockedKey ? blockedKey.split(",") : []);
    for (const f of model.floors) out.set(f.id, floorLamps(f, model.ceilingHeight, floorBaseY(model, f), (fx) => switchedOn(fx) && !blocked.has(fx.id)));
    return out;
  }, [model, lampsOn, blockedKey]);
  const lampsRef = useRef(lampsByFloor);
  lampsRef.current = lampsByFloor;

  useEffect(() => {
    let state: Exposure = EXPOSURE_START;
    let last: Metered | null = null;
    let lampsSeen = lampsRef.current;
    let forced: number | null = null;
    let fresh = true;
    const out = { factor: 1 };
    exposureByRenderer.set(gl, out);

    const step = (ctx: WalkTermCtx): boolean => {
      // A still is being traced: it owns the renderer's exposure (1) until it is done.
      if (useStore.getState().rendering) return false;
      const settings = useStore.getState().settings;
      const mode = walkAdaptOf(settings);
      const alt = altRef.current;
      if (forced !== null) {
        state = { ev: forced, target: forced, since: 0 };
      } else if (ctx.pose && ctx.pose.stair !== null && !fresh && !ctx.jumped) {
        // On the stairs there is no room to meter: hold the view from the room the flight started in.
        state = easeExposure(state, null, ctx.dt, false);
      } else {
        const changed = fresh || ctx.jumped || mode !== last?.mode || alt !== last?.alt || lampsRef.current !== lampsSeen;
        let next: number | null = null;
        let snap = false;
        if (changed || state.since >= METER_EVERY) {
          const m = measure(ctx, mode, alt, lampsRef.current);
          const altMoved = last !== null && (alt === null ? last.alt !== null : last.alt === null || Math.abs(alt - last.alt) > 0.5);
          // A lamp switched on in the room the walker stands in snaps (the eyes cut down fast); switching off, or walking
          // between rooms, eases like any other change.
          const lampOn = lampsRef.current !== lampsSeen && last !== null && m.roomId === last.roomId && m.lamps - last.lamps > 0.05;
          snap = fresh || ctx.jumped || mode !== last?.mode || altMoved || lampOn;
          next = targetEV(m.L, mode, portraitOf(ctx));
          last = m;
          lampsSeen = lampsRef.current;
          fresh = false;
        }
        state = easeExposure(state, next, ctx.dt, snap);
      }
      const f = exposureFactor(state.ev);
      if (currentQuality() === "high") {
        out.factor = f;
        gl.toneMappingExposure = 1;
      } else {
        out.factor = 1;
        gl.toneMappingExposure = f;
      }
      return forced === null && exposureBusy(state);
    };
    const portraitOf = (ctx: WalkTermCtx) => ctx.lens.cls === "small" && ctx.lens.aspect < 1;
    const measure = (ctx: WalkTermCtx, mode: string, alt: number | null, lampsMap: Map<string, LampLight[]>): Metered => {
      const sky = skyLevel(alt);
      const pose = ctx.pose;
      const level = pose ? ctx.nav.levels.find((l) => l.level === pose.level) : undefined;
      const room = pose && pose.stair === null ? level?.rooms.find((r) => pointInPolygon(pose, r.poly)) : undefined;
      let floorArea = OUTSIDE_AREA, glazedArea = OUTSIDE_AREA, lamps = 0, glazing = 1;
      if (pose && level && room) {
        glazing = 0;
        floorArea = room.area;
        const glass = ctx.nav.glazing.filter((g) => g.level === pose.level && g.roomId === room.id);
        glazedArea = glass.reduce((a, g) => a + g.width * (g.head - g.sill), 0);
        let lm = 0;
        for (const l of lampsMap.get(level.floorId) ?? []) if (pointInPolygon({ x: l.pos[0], y: l.pos[2] }, room.poly)) lm += l.candela * 4 * Math.PI;
        lamps = lampTerm(lm, room.area);
        glazing = glazingFraction(
          { eye: [ctx.camera.position.x, ctx.camera.position.y, ctx.camera.position.z], yaw: pose.yaw, pitch: pose.pitch, vfovDeg: ctx.camera.fov, aspect: ctx.camera.aspect },
          panesOf(glass, level.baseY),
        );
      }
      const L = meter({ glazedArea, floorArea, sky, lamps, glazing, portrait: portraitOf(ctx) });
      return { sky, lamps, glazing, L, alt, mode, roomId: room?.id ?? null };
    };

    const unregister = registerWalkTerm("exposure", { step, probe: () => state.ev });
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __walkExposure: {
          force: (ev: number | null) => {
            forced = ev;
            if (ev === null) fresh = true;
            invalidate();
          },
          state: () => ({ ev: state.ev, target: state.target, factor: out.factor, gl: gl.toneMappingExposure, mode: last?.mode ?? null, glazing: last?.glazing ?? 0, L: last?.L ?? 0, lamps: last?.lamps ?? 0 }),
          // Left in place after the walk stops, so tests can check everything went back to 1.
          glExposure: () => gl.toneMappingExposure,
        },
      });
    }
    return () => {
      unregister();
      out.factor = 1;
      gl.toneMappingExposure = 1;
      invalidate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  return null;
}
