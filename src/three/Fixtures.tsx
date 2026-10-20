import { memo, useMemo } from "react";
import * as THREE from "three";
import type { Floor } from "../types";
import { toWorld } from "../lib/geometry";
import { DEFAULT_WORKTOP, burners, byId, wardrobeDoorCount, type Symbol } from "../lib/catalogue";
import { fixtureBox } from "../lib/planMath";

/** Simple primitive-built furniture and fixtures, placed from the plan at their own size, colour and rotation. */
export function Fixtures({ floor }: { floor: Floor }) {
  return (
    <group>
      {(floor.fixtures ?? []).map((f) => {
        const item = byId(f.type);
        if (!item) return null;
        const p = toWorld(floor, { x: f.x, y: f.y });
        const b = fixtureBox(f, item);
        return (
          <group key={f.id} position={[p.x, b.z0, p.y]} rotation={[0, (-f.rot * Math.PI) / 180, 0]}>
            <FixtureMesh symbol={item.symbol} w={b.w} d={b.d} h={b.h} color={f.color ?? item.color} worktop={f.worktop ?? WORKTOP} />
          </group>
        );
      })}
    </group>
  );
}

// Every part is a unit box, cylinder or quarter cylinder scaled into place, and
// materials are shared by colour, so a kitchen of fifty parts costs a handful
// of geometries and materials however many fixtures there are.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
/** Quarter of a unit-radius cylinder in the +x/+z quadrant, from the axis at its corner. */
const QUARTER = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI / 2);
const QUARTER_SHELL = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, 0, Math.PI / 2);
const GEOMETRY = { box: BOX, cyl: CYL, quarter: QUARTER, shell: QUARTER_SHELL };
const AXIS_X: [number, number, number] = [0, 0, Math.PI / 2];
const AXIS_Z: [number, number, number] = [Math.PI / 2, 0, 0];

type Finish = "matt" | "satin" | "gloss" | "metal" | "glass" | "mirror";
const materials = new Map<string, THREE.Material>();
function material(color: string, finish: Finish): THREE.Material {
  const key = color + finish;
  let m = materials.get(key);
  if (!m) {
    if (finish === "glass") m = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    else if (finish === "mirror") m = new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.9 });
    else if (finish === "metal") m = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.8 });
    else m = new THREE.MeshStandardMaterial({ color, roughness: finish === "matt" ? 0.85 : finish === "satin" ? 0.5 : 0.2 });
    materials.set(key, m);
  }
  return m;
}

interface Part {
  g: keyof typeof GEOMETRY;
  /** Centre (for a quarter: the corner on its axis, at mid-height). */
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  f: Finish;
  /** Axis of a cylinder (default standing, along y). */
  axis?: "x" | "z";
}

const WHITE = "#f5f5f5";
const CHROME = "#b8bcc2";
const STEEL = "#c9ccd0";
const KNOB = "#ece8df";
const WORKTOP = DEFAULT_WORKTOP;
const PLINTH = "#3f4247";
const DARK = "#1f2125";
const GLASS = "#bfe0ee";
const MARBLE = "#ece6da";
const BRASS = "#c8a24a";

const FixtureMesh = memo(function FixtureMesh({ symbol, w, d, h, color, worktop }: { symbol: Symbol; w: number; d: number; h: number; color: string; worktop: string }) {
  const parts = useMemo(() => fixtureParts(symbol, w, d, h, color, worktop), [symbol, w, d, h, color, worktop]);
  return (
    <group>
      {parts.map((pt, i) => (
        <mesh
          key={i}
          geometry={GEOMETRY[pt.g]}
          material={material(pt.c, pt.f)}
          position={pt.p}
          scale={pt.s}
          rotation={pt.axis === "x" ? AXIS_X : pt.axis === "z" ? AXIS_Z : undefined}
          castShadow={pt.f !== "glass"}
          receiveShadow
        />
      ))}
    </group>
  );
});

/**
 * The parts of a fixture in its local frame: origin at the centre of its
 * footprint on its base, y up, back towards -z (the top of the plan).
 */
function fixtureParts(symbol: Symbol, w: number, d: number, h: number, color: string, worktopColor = WORKTOP): Part[] {
  const out: Part[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c = color, f: Finish = "matt") =>
    out.push({ g: "box", p: [x, y, z], s: [Math.max(sx, 0.001), Math.max(sy, 0.001), Math.max(sz, 0.001)], c, f });
  const cyl = (x: number, y: number, z: number, dia: number, len: number, c: string, f: Finish = "matt", axis?: "x" | "z") =>
    out.push({ g: "cyl", p: [x, y, z], s: [dia, len, dia], c, f, axis });
  /** Door fronts with handles across a carcass face from y0 to y1, one per ~0.6 m. */
  const doors = (y0: number, y1: number, z: number, pitch = 0.6, handleAtTop = true) => {
    const n = Math.max(1, Math.round(w / pitch));
    for (let i = 1; i < n; i++) box(-w / 2 + (i * w) / n, (y0 + y1) / 2, z, 0.006, y1 - y0 - 0.02, 0.012, DARK);
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + ((i + 0.5) * w) / n;
      box(cx, handleAtTop ? y1 - 0.06 : y0 + 0.06, z + 0.012, Math.min(0.16, w / n - 0.1), 0.012, 0.02, CHROME, "metal");
    }
  };
  /** A kitchen base carcass of height top, with plinth and worktop. Returns the front face z. */
  const base = (top: number, depth = d, zc = 0, worktop = worktopColor) => {
    box(0, 0.05, zc - 0.03, w - 0.02, 0.1, depth - 0.08, PLINTH);
    box(0, (0.1 + top - 0.04) / 2, zc - 0.01, w, top - 0.14, depth - 0.02, color, "satin");
    box(0, top - 0.02, zc, w, 0.04, depth, worktop, "satin");
    return zc + depth / 2 - 0.01;
  };

  switch (symbol) {
    case "bed": {
      box(0, 0.15, 0, w, 0.3, d, "#8a6d4b");
      box(0, 0.4, d * 0.03, w - 0.06, 0.2, d - 0.12, color);
      box(0, 0.53, -d / 2 + 0.22, w - 0.2, 0.1, 0.3, "#ffffff");
      box(0, 0.51, d * 0.18, w - 0.04, 0.04, d * 0.6, shade(color, 0.85));
      box(0, (h + 0.5) / 2, -d / 2 + 0.03, w, h + 0.5, 0.06, "#8a6d4b");
      break;
    }
    case "cot": {
      const rail = 0.04;
      box(0, 0.3, 0, w - 0.06, 0.12, d - 0.06, WHITE);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - rail / 2), h / 2, sz * (d / 2 - rail / 2), rail, h, rail, color, "satin");
      for (const sz of [-1, 1]) {
        box(0, h - rail / 2, sz * (d / 2 - rail / 2), w, rail, rail, color, "satin");
        box(0, 0.2, sz * (d / 2 - rail / 2), w, rail, rail, color, "satin");
        const bars = Math.max(4, Math.round(w / 0.1));
        for (let i = 1; i < bars; i++) box(-w / 2 + (i * w) / bars, (h + 0.2) / 2, sz * (d / 2 - rail / 2), 0.02, h - 0.2, 0.02, color, "satin");
      }
      for (const sx of [-1, 1]) box(sx * (w / 2 - rail / 2), (h + 0.2) / 2, 0, rail, h - 0.2, d - 0.08, color, "satin");
      break;
    }
    case "toilet":
      box(0, 0.42, -d / 2 + 0.1, w, 0.84, 0.2, WHITE, "gloss");
      box(0, 0.2, d * 0.12, w * 0.85, 0.4, d * 0.62, WHITE, "gloss");
      box(0, 0.41, d * 0.12, w * 0.88, 0.03, d * 0.66, WHITE, "gloss");
      break;
    case "basin":
      box(0, 0.4, 0, w * 0.35, 0.8, d * 0.35, WHITE, "gloss");
      box(0, 0.8, 0, w, 0.12, d, WHITE, "gloss");
      cyl(0, 0.93, -d / 2 + 0.06, 0.03, 0.16, CHROME, "metal");
      break;
    case "vanity": {
      box(0, 0.08, -0.02, w - 0.04, 0.16, d - 0.06, PLINTH);
      box(0, (0.16 + h - 0.06) / 2, -0.01, w, h - 0.22, d - 0.02, color, "satin");
      box(0, (0.16 + h - 0.06) / 2, d / 2 - 0.01, w - 0.02, 0.006, 0.012, DARK);
      box(0, h - 0.03, 0, w, 0.06, d, WHITE, "gloss");
      box(0, h - 0.02, 0.02, w * 0.7, 0.05, d * 0.6, "#dde6ea", "gloss");
      cyl(0, h + 0.08, -d / 2 + 0.06, 0.03, 0.16, CHROME, "metal");
      break;
    }
    case "shower":
      box(0, 0.04, 0, w, 0.08, d, WHITE, "gloss");
      box(w / 2 - 0.01, 1.05, 0, 0.02, 1.95, d, GLASS, "glass");
      box(0, 1.05, d / 2 - 0.01, w, 1.95, 0.02, GLASS, "glass");
      box(0, 1.9, -d / 2 + 0.05, 0.04, 0.4, 0.04, CHROME, "metal");
      break;
    case "quadrant":
      // Tray and curved glass from the back-left corner; the walls make the straight sides.
      out.push({ g: "quarter", p: [-w / 2, 0.04, -d / 2], s: [w, 0.08, d], c: WHITE, f: "gloss" });
      out.push({ g: "shell", p: [-w / 2, 1.05, -d / 2], s: [w - 0.01, 1.9, d - 0.01], c: GLASS, f: "glass" });
      box(-w / 2 + 0.06, 1.6, -d / 2 + 0.03, 0.03, 0.9, 0.03, CHROME, "metal");
      break;
    case "bath":
      box(0, h / 2, 0, w, h, d, WHITE, "gloss");
      box(0, h - 0.03, 0, w - 0.14, 0.04, d - 0.14, "#dbe9f0", "gloss");
      cyl(w / 2 - 0.12, h + 0.08, 0, 0.03, 0.16, CHROME, "metal");
      break;
    case "towel-rail": {
      for (const sx of [-1, 1]) cyl(sx * (w / 2 - 0.015), h / 2, 0, 0.03, h, color, "metal");
      const bars = Math.max(4, Math.round(h / 0.1));
      for (let i = 0; i < bars; i++) cyl(0, 0.05 + (i * (h - 0.1)) / (bars - 1), 0, 0.018, w - 0.03, color, "metal", "x");
      break;
    }
    case "sofa": {
      const back = Math.min(0.22, d * 0.3);
      const arm = Math.min(0.2, w * 0.15);
      box(0, 0.22, back / 2, w - arm * 2, 0.44, d - back, color);
      box(0, (0.44 + h) / 2 - 0.1, -d / 2 + back / 2, w, h - 0.24, back, color);
      box(0, 0.1, 0, w, 0.2, d, shade(color, 0.8));
      for (const sx of [-1, 1]) box(sx * (w / 2 - arm / 2), 0.31, 0, arm, 0.62, d, color);
      break;
    }
    case "corner-sofa": {
      // A run along the back and a return down the left, as on the plan.
      const s = Math.min(0.95, w * 0.45, d * 0.5);
      const back = Math.min(0.22, s * 0.3);
      const arm = Math.min(0.2, s * 0.25);
      const base = shade(color, 0.8);
      box(0, 0.1, -d / 2 + s / 2, w, 0.2, s, base);
      box(-w / 2 + s / 2, 0.1, s / 2, s, 0.2, d - s, base);
      box((back - arm) / 2, 0.32, -d / 2 + (back + s) / 2, w - back - arm, 0.24, s - back, color);
      box(-w / 2 + (back + s) / 2, 0.32, (s - arm) / 2, s - back, 0.24, d - s - arm, color);
      box(0, (0.44 + h) / 2 - 0.1, -d / 2 + back / 2, w, h - 0.24, back, color);
      box(-w / 2 + back / 2, (0.44 + h) / 2 - 0.1, back / 2, back, h - 0.24, d - back, color);
      box(w / 2 - arm / 2, 0.31, -d / 2 + s / 2, arm, 0.62, s, color);
      box(-w / 2 + s / 2, 0.31, d / 2 - arm / 2, s, 0.62, arm, color);
      break;
    }
    case "table":
      box(0, h - 0.02, 0, w, 0.04, d, color, "satin");
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05), 0.06, h - 0.04, 0.06, color);
      break;
    case "chair":
      box(0, 0.45, 0, w, 0.04, d, color);
      box(0, 0.68, -d / 2 + 0.02, w, 0.45, 0.04, color);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - 0.03), 0.22, sz * (d / 2 - 0.03), 0.04, 0.44, 0.04, color);
      break;
    case "car":
      box(0, 0.45, 0, w, 0.6, d, color, "gloss");
      box(0, 1.05, d * 0.05, w - 0.2, 0.6, d * 0.5, "#3b4652", "gloss");
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(sx * (w / 2 - 0.1), 0.3, sz * d * 0.32, 0.6, 0.2, "#222", "matt", "x");
      break;
    case "washer":
      // Round porthole door under a control strip.
      box(0, h / 2, 0, w, h, d, color, "gloss");
      cyl(0, h * 0.45, d / 2 + 0.01, Math.min(w, h) * 0.55, 0.02, "#9aa3ab", "gloss", "z");
      box(0, h - 0.06, d / 2 + 0.005, w - 0.04, 0.08, 0.01, "#d0d3d6", "satin");
      break;
    case "appliance":
      box(0, h / 2, 0, w, h, d, color, "gloss");
      if (h > 1.2) {
        // Fridge freezer: two doors with handles.
        box(0, h * 0.6, d / 2 + 0.003, w - 0.01, 0.008, 0.008, DARK);
        box(-w / 2 + 0.06, h * 0.78, d / 2 + 0.02, 0.02, 0.35, 0.03, CHROME, "metal");
        box(-w / 2 + 0.06, h * 0.42, d / 2 + 0.02, 0.02, 0.3, 0.03, CHROME, "metal");
      } else {
        // Dishwasher: control strip and a handle across the top.
        box(0, h - 0.05, d / 2 + 0.005, w - 0.02, 0.08, 0.01, "#d0d3d6", "satin");
        box(0, h - 0.13, d / 2 + 0.02, w * 0.5, 0.02, 0.03, CHROME, "metal");
      }
      break;
    case "cabinet": {
      const kitchen = h > 0.85 && h < 0.95;
      if (kitchen) doors(0.12, h - 0.06, base(h));
      else {
        box(0, 0.04, 0, w - 0.04, 0.08, d - 0.04, shade(color, 0.7));
        box(0, (h + 0.08) / 2, 0, w, h - 0.08, d, color, "satin");
        doors(0.1, h - 0.04, d / 2, 0.55, true);
      }
      break;
    }
    case "worktop":
      doors(0.12, h - 0.06, base(h));
      break;
    case "island": {
      // Units on the front side, worktop overhanging at the back for stools.
      const over = Math.min(0.3, d * 0.35);
      box(0, 0.05, over / 2 - 0.02, w - 0.04, 0.1, d - over - 0.08, PLINTH);
      box(0, (0.1 + h - 0.04) / 2, over / 2, w, h - 0.14, d - over, color, "satin");
      box(0, h - 0.02, 0, w + 0.04, 0.04, d, worktopColor, "satin");
      doors(0.12, h - 0.06, d / 2);
      break;
    }
    case "sink": {
      const front = base(h);
      doors(0.12, h - 0.06, front);
      const bw = Math.min(w * 0.5, 0.5);
      const bx = -w / 2 + 0.06 + bw / 2;
      box(bx, h - 0.005, 0.02, bw, 0.012, d - 0.18, STEEL, "metal");
      box(bx, h - 0.004, 0.02, bw - 0.04, 0.014, d - 0.22, "#8e9399", "metal");
      box((bx + bw / 2 + w / 2) / 2, h - 0.004, 0.02, w / 2 - bx - bw / 2 - 0.06, 0.012, d - 0.18, STEEL, "metal");
      cyl(bx, h + 0.15, -d / 2 + 0.06, 0.03, 0.3, CHROME, "metal");
      box(bx, h + 0.29, -d / 2 + 0.14, 0.025, 0.025, 0.18, CHROME, "metal");
      break;
    }
    case "hob": {
      box(0, h / 2, 0, w, h, d, color, "gloss");
      const rings: [number, number, number][] = [
        [-0.3, -0.25, 0.17],
        [0.3, -0.25, 0.13],
        [-0.3, 0.25, 0.13],
        [0.3, 0.25, 0.19],
      ];
      for (const [fx, fz, dia] of rings) cyl(fx * w, h + 0.002, fz * d, dia, 0.004, "#5a5e64", "satin");
      break;
    }
    case "range": {
      box(0, h / 2 - 0.02, 0, w, h - 0.04, d, color, "gloss");
      box(0, h - 0.02, 0, w, 0.04, d, DARK, "gloss");
      for (const [fx, fz] of burners(w)) cyl(fx * w, h + 0.01, fz * d, 0.12, 0.02, "#2a2a2a", "metal");
      // One oven on a cooker, two side by side on a range, under a control panel and handle rail.
      const ovens = w < 0.8 ? [0] : [-w / 4, w / 4];
      for (const x of ovens) box(x, 0.42, d / 2 + 0.005, w / ovens.length - 0.08, 0.5, 0.01, "#30353a", "gloss");
      box(0, h - 0.12, d / 2 + 0.005, w - 0.04, 0.1, 0.01, shade(color, 1.2), "satin");
      cyl(0, 0.75, d / 2 + 0.05, 0.025, w - 0.1, CHROME, "metal", "x");
      box(0, 0.04, 0, w - 0.02, 0.08, d - 0.04, PLINTH);
      break;
    }
    case "wall-cabinet":
      box(0, h / 2, 0, w, h, d, color, "satin");
      doors(0.01, h - 0.01, d / 2, 0.6, false);
      box(0, -0.01, 0, w, 0.02, d, shade(color, 0.85), "satin");
      break;
    case "oven":
    case "tall": {
      box(0, 0.05, -0.03, w - 0.02, 0.1, d - 0.08, PLINTH);
      box(0, (0.1 + h) / 2, 0, w, h - 0.1, d, color, "satin");
      const front = d / 2;
      if (symbol === "oven") {
        // Built-in oven at eye level between a drawer below and a door above.
        box(0, 1.1, front + 0.005, w - 0.04, 0.58, 0.01, "#2a2d31", "gloss");
        box(0, 1.27, front + 0.03, w - 0.16, 0.02, 0.03, CHROME, "metal");
        box(0, 0.8, front, w - 0.02, 0.006, 0.012, DARK);
        box(0, 1.4, front, w - 0.02, 0.006, 0.012, DARK);
        box(0, 0.75, front + 0.012, 0.16, 0.012, 0.02, CHROME, "metal");
        box(0, 1.46, front + 0.012, 0.16, 0.012, 0.02, CHROME, "metal");
      } else {
        box(0, 1.35, front, w - 0.02, 0.006, 0.012, DARK);
        box(w / 2 - 0.05, 1.1, front + 0.012, 0.012, 0.3, 0.02, CHROME, "metal");
        box(w / 2 - 0.05, 1.6, front + 0.012, 0.012, 0.3, 0.02, CHROME, "metal");
      }
      break;
    }
    case "shelves": {
      const t = 0.02;
      box(0, h / 2, -d / 2 + 0.005, w, h, 0.01, shade(color, 0.85));
      for (const sx of [-1, 1]) box(sx * (w / 2 - t / 2), h / 2, 0, t, h, d, color, "satin");
      const n = Math.max(2, Math.round(h / 0.35));
      for (let i = 0; i <= n; i++) box(0, t / 2 + (i * (h - t)) / n, 0, w - t * 2, t, d, color, "satin");
      // A few rows of books so it reads as a bookcase.
      const bookColours = ["#7b3b3b", "#2f4f6f", "#5d6b3a", "#b08a4a"];
      for (let i = 0; i < n; i++) {
        const y = t + (i * (h - t)) / n;
        const bh = Math.min(0.26, (h - t) / n - t - 0.04);
        bookColours.forEach((c, j) => box(-w / 2 + t + (w - t * 2) * (0.05 + j * 0.2 + ((i * 7) % 3) * 0.02), y + bh / 2, 0.01, (w - t * 2) * 0.16, bh, d * 0.75, c));
      }
      break;
    }
    case "dresser": {
      box(0, h - 0.02, 0, w, 0.04, d, color, "satin");
      box(w / 2 - 0.22, (h - 0.04) / 2 + 0.05, 0, 0.42, h - 0.14, d - 0.02, color, "satin");
      for (const sz of [-1, 1]) box(-w / 2 + 0.03, (h - 0.04) / 2, sz * (d / 2 - 0.03), 0.04, h - 0.04, 0.04, color);
      box(w / 2 - 0.22, 0.03, 0, 0.42, 0.06, d - 0.06, shade(color, 0.8));
      box(0, h + 0.4, -d / 2 + 0.03, w * 0.6, 0.7, 0.03, shade(color, 0.8), "satin");
      box(0, h + 0.4, -d / 2 + 0.05, w * 0.6 - 0.06, 0.64, 0.01, "#cfd8dc", "mirror");
      break;
    }
    case "fitted-wardrobe": {
      // Flat-panel doors over a full-height carcass: tall doors below and a row of top boxes
      // above them, as in the photos. Thin dark joints stand in for the shadow gaps.
      const t = 0.02; // door thickness
      const gap = 0.006; // joint between doors
      const top = Math.min(0.4, h * 0.2); // top-box height
      const skirt = 0.06;
      const front = d / 2;
      const zd = front - t / 2;
      const joint = shade(color, 0.5);
      box(0, h / 2, -t / 2, w, h, d - t, shade(color, 0.9), "satin");
      const n = wardrobeDoorCount(symbol, w);
      const dw = w / n;
      const rows: [number, number, number][] = [
        [skirt, h - top - gap, 1.0],
        [h - top, h, h - top + 0.08],
      ];
      for (const [y0, y1, knobY] of rows) {
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + (i + 0.5) * dw;
          box(x, (y0 + y1) / 2, zd, dw - gap, y1 - y0 - gap, t, color, "satin");
          // Knobs sit on the edge nearest the middle of each pair of doors.
          cyl(x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), knobY, front + 0.01, 0.03, 0.02, KNOB, "satin", "z");
        }
      }
      for (let i = 1; i < n; i++) box(-w / 2 + i * dw, (h + skirt) / 2, zd, gap, h - skirt, t, joint);
      box(0, skirt / 2, zd, w, skirt, t, shade(color, 0.85), "satin");
      break;
    }
    case "shaker-wardrobe": {
      // Full-height framed doors, as in the photos: a recessed panel above a shorter one, each
      // outlined by a thin raised bead, with a round knob on the edge nearest the middle of each
      // pair of doors. A run with an odd number of doors starts with a single one.
      const t = 0.018;
      const gap = 0.005;
      const skirt = 0.08;
      const zd = d / 2 - t / 2;
      const front = d / 2;
      const bead = shade(color, 1.2);
      box(0, h / 2, -t / 2, w, h, d - t, shade(color, 0.9), "satin");
      box(0, skirt / 2, zd, w, skirt, t, shade(color, 0.85), "satin");
      // A dark backer just behind the door fronts, so the joints between doors read as solid shadow gaps.
      box(0, (skirt + h - 0.02) / 2, zd, w, h - 0.02 - skirt, t * 0.8, shade(color, 0.5));
      const n = wardrobeDoorCount(symbol, w);
      const dw = w / n;
      const y0 = skirt;
      const y1 = h - 0.02;
      const rail = 0.07; // rail and stile width outside the bead
      const mid = y0 + (y1 - y0) * 0.33; // bottom of the long upper panel
      const knobY = mid + 0.1;
      const lone = n % 2; // doors before the first pair
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * dw;
        box(x, (y0 + y1) / 2, zd, dw - gap, y1 - y0, t, color, "satin");
        const bw = dw - gap - 2 * rail;
        // Bead round each panel, standing 6 mm proud of the door face.
        for (const [by0, by1] of [
          [y0 + rail, mid - rail / 2],
          [mid + rail / 2, y1 - rail],
        ]) {
          const bh = by1 - by0;
          const bc = (by0 + by1) / 2;
          for (const sy of [by0, by1]) box(x, sy, front + 0.003, bw, 0.009, 0.006, bead, "satin");
          for (const sx of [-1, 1]) box(x + (sx * bw) / 2, bc, front + 0.003, 0.009, bh, 0.006, bead, "satin");
        }
        const right = i < lone || (i - lone) % 2 === 0;
        cyl(x + (right ? 1 : -1) * (dw / 2 - 0.045), knobY, front + 0.012, 0.032, 0.024, KNOB, "satin", "z");
      }
      break;
    }
    case "hood": {
      // A slim canopy hood across the bottom, under a short wall cabinet set back to the wall-cabinet depth.
      const cd = Math.min(d, 0.33);
      const cy0 = Math.min(0.26, h * 0.4);
      box(0, (cy0 + h) / 2, -d / 2 + cd / 2, w, h - cy0, cd, color, "satin");
      doors(cy0 + 0.01, h - 0.01, -d / 2 + cd, 0.6, false);
      box(0, 0.06 + (cy0 - 0.06) / 2, 0, w, cy0 - 0.06, d, "#26282c", "satin");
      box(0, 0.055, 0.02, w - 0.06, 0.012, d - 0.08, "#8e9399", "metal");
      box(0, cy0 - 0.03, d / 2 + 0.003, w - 0.02, 0.012, 0.006, "#4b4f55", "satin");
      break;
    }
    case "fireplace": {
      // Hearth slab across the full footprint; a carved surround (legs, frieze and mantel shelf) against
      // the wall framing a marble back panel, with a brass-framed gas fire at its foot.
      const hearth = 0.04;
      const sw = w * 0.9;
      const sd = Math.min(0.14, d * 0.4);
      const lw = Math.min(0.17, sw * 0.14);
      const zs = -d / 2 + sd / 2;
      const front = -d / 2 + sd;
      const frieze = Math.min(0.16, h * 0.14);
      const shelf = 0.05;
      const legTop = h - shelf - frieze;
      const carve = shade(color, 1.3);
      box(0, hearth / 2, 0, w, hearth, d, MARBLE, "gloss");
      box(0, (hearth + legTop) / 2, -d / 2 + 0.015, sw - lw * 2, legTop - hearth, 0.03, MARBLE, "gloss");
      for (const sx of [-1, 1]) {
        const x = sx * (sw / 2 - lw / 2);
        box(x, (hearth + legTop) / 2, zs, lw, legTop - hearth, sd, color, "satin");
        box(x, hearth + (legTop - hearth) * 0.55, front + 0.006, lw * 0.5, (legTop - hearth) * 0.6, 0.012, carve, "satin");
        box(x, legTop - 0.05, front + 0.012, lw * 0.8, 0.08, 0.024, carve, "satin");
      }
      box(0, legTop + frieze / 2, zs, sw, frieze, sd, color, "satin");
      box(0, legTop + frieze / 2, front + 0.006, sw * 0.42, frieze * 0.5, 0.012, carve, "satin");
      box(0, h - shelf / 2, -d / 2 + (sd + 0.06) / 2, sw + 0.1, shelf, sd + 0.06, color, "satin");
      // Gas fire: brass frame, black firebox with coals, and a dark fret along the bottom.
      const fw = Math.min(0.5, sw - lw * 2 - 0.1);
      const fh = Math.min(0.58, legTop - hearth - 0.12);
      const fz = -d / 2 + 0.06;
      box(0, hearth + fh / 2, fz, fw, fh, 0.08, BRASS, "metal");
      box(0, hearth + fh / 2 + 0.02, fz + 0.041, fw - 0.09, fh - 0.15, 0.004, "#141518", "gloss");
      box(0, hearth + 0.17, fz + 0.045, fw - 0.13, 0.09, 0.02, "#3b3734");
      box(0, hearth + 0.05, fz + 0.06, fw - 0.02, 0.06, 0.04, "#1d1e21", "metal");
      break;
    }
    case "boiler":
      box(0, h / 2, 0, w, h, d, color, "gloss");
      box(0, 0.08, d / 2 + 0.005, w - 0.06, 0.1, 0.01, "#4b5563", "satin");
      cyl(0, h + 0.1, -d / 2 + 0.1, 0.1, 0.2, "#e5e7eb", "satin");
      break;
    default:
      box(0, h / 2, 0, w, h, d, color, "satin");
  }
  return out;
}

/** Lighten (k > 1) or darken (k < 1) a hex colour. */
function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k);
  c.g = Math.min(1, c.g * k);
  c.b = Math.min(1, c.b * k);
  return "#" + c.getHexString();
}
