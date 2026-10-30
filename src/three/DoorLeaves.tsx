import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Group, Material } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { ShellLeaf } from "./shell";
import { getMaterial } from "./textures";
import { easeInOut } from "../lib/cameraViews";
import { useWalk } from "../walkStore";
import { DOOR_TAG } from "./walk/doorTag";

/**
 * The moving leaves of a floor's doors while walking (shell.ts builds them apart from the merged shell). Each door is a
 * group at its opening's place; each panel inside is posed from the door's openness, which eases towards the walk
 * store's door state: swing leaves turn, a patio slider runs along its track, bi-fold panels fold. A tap on one finds its
 * door through the userData tag (three/walk/doorTag.ts).
 */

/** How long a move takes, seconds. */
const DURATION = { swing: 0.7, slide: 0.9, fold: 0.9 } as const;

interface LiveDoor {
  key: string;
  kind: string;
  t: () => number;
  panels: () => { x: number; z: number; ry: number }[];
}
/** Doors on screen now, for the dev hook `window.__walkDoors`. */
const live = new Set<LiveDoor>();
if (import.meta.env?.DEV && typeof window !== "undefined") {
  Object.assign(window, { __walkDoors: () => [...live].map((d) => ({ key: d.key, kind: d.kind, t: d.t(), panels: d.panels() })) });
}

const reducedMotion = (): boolean => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function DoorLeaves({ leaves, glass }: { leaves: ShellLeaf[]; glass: Material }) {
  return (
    <>
      {leaves.map((l) => (
        <Leaf key={l.key} leaf={l} glass={glass} />
      ))}
    </>
  );
}

function Leaf({ leaf, glass }: { leaf: ShellLeaf; glass: Material }) {
  const { key, initial, frame, panels, kind, motion } = leaf;
  const invalidate = useThree((s) => s.invalidate);
  const target = useWalk((s) => (s.doors[key] ?? initial) ? 1 : 0);
  const groups = useRef<(Group | null)[]>([]);
  /** Linear progress of the move, 0 shut to 1 open; the pose uses it eased. */
  const lin = useRef(initial ? 1 : 0);
  const tag = useMemo(() => ({ [DOOR_TAG]: { key, initial } }), [key, initial]);

  const apply = () => {
    const t = easeInOut(lin.current);
    panels.forEach((p, i) => {
      const g = groups.current[i];
      if (!g) return;
      const o = p.pose(t);
      g.position.set(o.x, o.y, o.z);
      g.rotation.set(0, o.ry, 0);
    });
  };
  // A first render places the leaf at its start with no animation; the doors can already differ from it (a rebuilt shell
  // while a door is open), so it starts at the store's state.
  useLayoutEffect(() => {
    lin.current = target;
    apply();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaf]);
  useEffect(() => {
    if (lin.current === target) return;
    if (reducedMotion()) {
      lin.current = target;
      apply();
      useWalk.getState().doorSettled();
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  useFrame((_, dt) => {
    if (lin.current === target) return;
    const step = Math.min(dt, 0.5) / DURATION[motion];
    lin.current = target > lin.current ? Math.min(1, lin.current + step) : Math.max(0, lin.current - step);
    apply();
    if (lin.current === target) useWalk.getState().doorSettled();
    invalidate();
  });
  useEffect(() => {
    const d: LiveDoor = {
      key,
      kind,
      t: () => easeInOut(lin.current),
      panels: () => groups.current.map((g) => ({ x: g?.position.x ?? 0, z: g?.position.z ?? 0, ry: g?.rotation.y ?? 0 })),
    };
    live.add(d);
    return () => void live.delete(d);
  }, [key, kind]);

  return (
    <group position={[frame.centre.x, 0, frame.centre.y]} rotation-y={Math.atan2(-frame.dir.y, frame.dir.x)} userData={tag}>
      {panels.map((p, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)}>
          {p.meshes.map((m) => (
            <mesh key={m.key} geometry={m.geometry} material={m.spec.kind === "glass" ? glass : getMaterial(m.spec)} castShadow={m.castShadow} receiveShadow />
          ))}
        </group>
      ))}
    </group>
  );
}
