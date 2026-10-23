import type { DoorStyle, GarageStyle, GlazingPattern, Opening, OpeningKind, OpeningStyle, SillStyle } from "../types";
import { DOOR_STYLE_LABEL, GARAGE_STYLE_LABEL } from "../types";
import type { OpeningPlacement, V2 } from "./geometry";
import { bifoldLayout, type BifoldLayout } from "./bifold";
import type { FaceQuad, FaceSlot, V3 } from "./walls";

/**
 * Doors and windows as simple parts (boxes and a few quads) in each
 * opening's local frame, so the 3D view can merge a whole floor's joinery
 * into a handful of meshes. Pure maths: no three.js here.
 *
 * Local frame: x runs along the wall (the placement's dir), y is up from the
 * floor, z is the wall's +n side (n = dir turned anticlockwise on the plan).
 * `out` says which way along z is outside (1 or -1), or 0 for an internal wall.
 */

/**
 * Material of a part. "frame" is the house's window and door frame colour
 * (or the opening's frameColor), "joinery" painted internal woodwork,
 * "lining" a door's lining and architraves, "board" a window board inside,
 * "leaf"/"panel"/"groove" the opening's own colour (and a lighter or darker
 * shade of it for raised panels and plank joints), "obscure" patterned glass.
 */
export type PartMat =
  | "frame"
  | "joinery"
  | "lining"
  | "board"
  | "glass"
  | "obscure"
  | "sill"
  | "leaf"
  | "panel"
  | "groove"
  | "metal"
  | "lead"
  | "threshold";

export interface Box {
  mat: PartMat;
  /** Centre, local frame. */
  p: V3;
  /** Size along the box's own x, y, z. */
  s: V3;
  /** Rotation about y (three.js convention: +x turns towards -z). */
  ry?: number;
}

export interface OpeningParts {
  boxes: Box[];
  /** Extra faces (bay walls, bay roof and ceiling), local frame. */
  quads: FaceQuad[];
  /** Floor that extends into a bay, local frame (x, z) polygon. */
  bayFloor?: { x: number; z: number }[];
}

/** Frame section: width of the outer frame bars and depth of the frame, metres. */
const FW = 0.06;
const FD = 0.07;
/** Sash bars of opening casements. */
const SW = 0.045;
/** How far window and external door frames sit back from the outer face. */
const SET_BACK = 0.04;

export const DEFAULT_BAY_DEPTH = 0.6;
/** Dark stained timber of the lining and architrave of an archway (listing photos). */
export const DEFAULT_ARCHWAY_COLOUR = "#3b2418";

/** Styles offered for a kind of opening (none for kinds without a leaf style). */
export function styleOptions(kind: OpeningKind): { value: OpeningStyle; label: string }[] {
  if (kind === "door" || kind === "front") return (Object.keys(DOOR_STYLE_LABEL) as DoorStyle[]).map((value) => ({ value, label: DOOR_STYLE_LABEL[value] }));
  if (kind === "garage") return (Object.keys(GARAGE_STYLE_LABEL) as GarageStyle[]).map((value) => ({ value, label: GARAGE_STYLE_LABEL[value] }));
  return [];
}

/**
 * A front door unit along its wall (local x, -w/2 to w/2, metres): the
 * door's span and each full-height side light's, split at the mullion
 * centres. The door gets what the lights leave, 0.75 to 0.98 m; a unit too
 * narrow for a light at least 0.2 m wide is all door. A light "by the hinges"
 * is on the hinge jamb's side (see doorSwing), "by the handle" the other.
 */
export function frontUnit(o: Pick<Opening, "sidelight" | "flipHinge">, w: number): { door: [number, number]; lights: [number, number][] } {
  const n = o.sidelight === "both" ? 2 : o.sidelight ? 1 : 0;
  const d = Math.max(0.75, Math.min(0.98, w - 0.4 * n));
  const l = (w - d) / Math.max(1, n);
  if (!n || l < 0.2) return { door: [-w / 2, w / 2], lights: [] };
  if (n === 2)
    return {
      door: [-w / 2 + l, w / 2 - l],
      lights: [
        [-w / 2, -w / 2 + l],
        [w / 2 - l, w / 2],
      ],
    };
  const hinge = o.flipHinge ? 1 : -1;
  const side = o.sidelight === "hinge" ? hinge : -hinge;
  return side < 0 ? { door: [-w / 2 + l, w / 2], lights: [[-w / 2, -w / 2 + l]] } : { door: [-w / 2, w / 2 - l], lights: [[w / 2 - l, w / 2]] };
}

/** The look of an opening with no style: panelled internal doors, glazed external doors, the classic front door, a panel-grid garage door. */
export function defaultStyle(kind: OpeningKind, external: boolean): OpeningStyle | undefined {
  if (kind === "door") return external ? "glazed" : "panel";
  if (kind === "front") return "front";
  if (kind === "garage") return "panel-grid";
  return undefined;
}

/** The opening's style if its kind offers it, else the kind's default. */
export function resolvedStyle(op: Opening, external: boolean): OpeningStyle | undefined {
  if (op.style && styleOptions(op.kind).some((o) => o.value === op.style)) return op.style;
  return defaultStyle(op.kind, external);
}

/**
 * Angle in degrees a swing leaf is drawn open. With `doorsOpen` off every leaf
 * is shut, whatever the opening's own openDeg says (the View switch wins);
 * with it on, the opening's openDeg, or the kind's default `deg`.
 */
export function effectiveOpenDeg(op: Pick<Opening, "openDeg">, deg: number, doorsOpen = true): number {
  if (!doorsOpen) return 0;
  return Math.max(0, Math.min(180, op.openDeg ?? deg));
}

/** Open angle of a swing leaf, radians. */
function openAngle(op: Opening, deg: number, doorsOpen: boolean): number {
  return (effectiveOpenDeg(op, deg, doorsOpen) * Math.PI) / 180;
}

/** Number of casements for a window of this width (UK: about 0.5-0.75 m each). */
export function casements(width: number): number {
  if (width < 0.75) return 1;
  if (width < 1.5) return 2;
  if (width < 2.4) return 3;
  return 4;
}

/** Centre of a frame set into an external wall near its outer face, or the wall's centre line inside. */
function frameZ(wallT: number, out: number): number {
  return out ? out * (wallT / 2 - SET_BACK - FD / 2) : 0;
}

/** Rotation that turns local +x to the plan direction (dx, dz). */
const rotTo = (dx: number, dz: number) => Math.atan2(-dz, dx);

/** Move boxes built in a sub-frame (origin o, x axis at angle ry) into the parent frame. */
function place(boxes: Box[], o: V3, ry: number): Box[] {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return boxes.map((b) => ({
    ...b,
    p: [o[0] + b.p[0] * c + b.p[2] * s, o[1] + b.p[1], o[2] - b.p[0] * s + b.p[2] * c],
    ry: (b.ry ?? 0) + ry,
  }));
}

/** One pane of a glazed frame, bounded by frame or bar centre lines; `sash` gives it an opening casement's border. */
interface Cell {
  a: number;
  b: number;
  lo: number;
  hi: number;
  sash: boolean;
}

/** Bars of a glazed frame inside the outer frame: vertical (x set) or horizontal (y set), from `from` to `to`. */
type Bar = { x: number; from: number; to: number } | { y: number; from: number; to: number };

/** Height of the rail under the top lights of a frame from y0 to y1. */
const topRail = (y0: number, y1: number) => y1 - Math.min(0.42, (y1 - y0) * 0.3);

/** Number of top lights across a fixed pane of width w (about one per 0.85 m). */
export function topLights(w: number): number {
  return Math.max(1, Math.round(w / 0.85));
}

/**
 * How a frame from x0 to x1 and y0 to y1 is divided into panes:
 * - grid: `n` casements side by side, with fixed top lights over a transom when `transom`;
 * - fixed: one fixed pane;
 * - fixed-top: one large fixed pane under a transom and one or more top-hung top lights;
 * - casement-fixed-casement: full-height side casements either side of a fixed centre pane under a top light.
 */
export function glazingLayout(
  pattern: GlazingPattern,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  n: number,
  transom: boolean,
): { cells: Cell[]; bars: Bar[] } {
  const w = x1 - x0;
  const h = y1 - y0;
  const yt = topRail(y0, y1);
  if (pattern === "fixed" || (pattern === "fixed-top" && h < 0.6)) return { cells: [{ a: x0, b: x1, lo: y0, hi: y1, sash: false }], bars: [] };
  if (pattern === "fixed-top") {
    const k = topLights(w);
    const cells: Cell[] = [{ a: x0, b: x1, lo: y0, hi: yt, sash: false }];
    const bars: Bar[] = [{ y: yt, from: x0, to: x1 }];
    for (let j = 0; j < k; j++) {
      cells.push({ a: x0 + (j * w) / k, b: x0 + ((j + 1) * w) / k, lo: yt, hi: y1, sash: true });
      if (j) bars.push({ x: x0 + (j * w) / k, from: yt, to: y1 });
    }
    return { cells, bars };
  }
  if (pattern === "casement-fixed-casement" && w >= 0.9 && h >= 0.6) {
    const sw = Math.max(0.3, Math.min(0.6, w * 0.24));
    const xa = x0 + sw;
    const xb = x1 - sw;
    return {
      cells: [
        { a: x0, b: xa, lo: y0, hi: y1, sash: true },
        { a: xa, b: xb, lo: y0, hi: yt, sash: false },
        { a: xa, b: xb, lo: yt, hi: y1, sash: true },
        { a: xb, b: x1, lo: y0, hi: y1, sash: true },
      ],
      bars: [
        { x: xa, from: y0, to: y1 },
        { x: xb, from: y0, to: y1 },
        { y: yt, from: xa, to: xb },
      ],
    };
  }
  // Grid: casements, each with a fixed top light on tall frames.
  const top = transom ? yt : y1;
  const cw = w / n;
  const cells: Cell[] = [];
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const a = x0 + i * cw;
    const b = x0 + (i + 1) * cw;
    if (i) bars.push({ x: a, from: y0, to: y1 });
    cells.push({ a, b, lo: y0, hi: top, sash: true });
    if (transom) cells.push({ a, b, lo: yt, hi: y1, sash: false });
  }
  if (transom) bars.push({ y: yt, from: x0, to: x1 });
  return { cells, bars };
}

/**
 * A glazed frame from x0 to x1 and y0 to y1, centred at depth z: outer
 * frame, then the bars and panes of the glazing pattern (see glazingLayout).
 * Opening casements get a sash border on the side `face` (the outside),
 * like uPVC or timber casement windows.
 */
function glazedFrame(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z: number,
  n: number,
  face: number,
  transom = y1 - y0 > 1.05,
  pattern: GlazingPattern = "grid",
): Box[] {
  const out: Box[] = [];
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const bar = (x: number, y: number, bw: number, bh: number, d = FD, dz = 0, mat: PartMat = "frame") =>
    out.push({ mat, p: [x, y, z + dz], s: [bw, bh, d] });
  bar(x0 + FW / 2, y0 + h / 2, FW, h);
  bar(x1 - FW / 2, y0 + h / 2, FW, h);
  bar(cx, y1 - FW / 2, w, FW);
  bar(cx, y0 + FW / 2, w, FW);
  const { cells, bars } = glazingLayout(pattern, x0, x1, y0, y1, n, transom);
  for (const b of bars) {
    if ("x" in b) bar(b.x, (b.from + b.to) / 2, FW, b.to - b.from);
    else bar((b.from + b.to) / 2, b.y, b.to - b.from, FW);
  }
  const sz = face * (FD / 2 + 0.006);
  for (const c of cells) {
    // Glass inset by the outer frame's full width, or half a bar's.
    const a = c.a + (c.a === x0 ? FW : FW / 2);
    const b = c.b - (c.b === x1 ? FW : FW / 2);
    const lo = c.lo + (c.lo === y0 ? FW : FW / 2);
    const hi = c.hi - (c.hi === y1 ? FW : FW / 2);
    if (b - a <= 0.02 || hi - lo <= 0.02) continue;
    out.push({ mat: "glass", p: [(a + b) / 2, (lo + hi) / 2, z], s: [b - a, hi - lo, 0.012] });
    // Sash border standing just proud of the frame on the outside.
    if (c.sash && b - a > 0.15 && hi - lo > 0.15) {
      bar(a + SW / 2, (lo + hi) / 2, SW, hi - lo, 0.012, sz);
      bar(b - SW / 2, (lo + hi) / 2, SW, hi - lo, 0.012, sz);
      bar((a + b) / 2, hi - SW / 2, b - a, SW, 0.012, sz);
      bar((a + b) / 2, lo + SW / 2, b - a, SW, 0.012, sz);
    }
  }
  return out;
}

/**
 * External sill under a window and the window board inside. A stone sill is
 * deep and projects well past the wall; a uPVC one is a thin nose in the
 * frame colour (the "sill" part's colour follows the style, see partSpec).
 */
function sills(x0: number, x1: number, y: number, wallT: number, out: number, style: SillStyle = "stone"): Box[] {
  if (!out) return [];
  const half = wallT / 2;
  const fOut = Math.abs(frameZ(wallT, out)) + FD / 2;
  const fIn = Math.abs(frameZ(wallT, out)) - FD / 2;
  const dIn = half + fIn + 0.025;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const boxes: Box[] = [{ mat: "board", p: [cx, y - 0.008, out * (fIn - dIn / 2)], s: [w + 0.06, 0.025, dIn] }];
  if (style === "stone") {
    const dOut = half - fOut + 0.05;
    boxes.unshift({ mat: "sill", p: [cx, y - 0.02, out * (fOut + dOut / 2)], s: [w + 0.12, 0.05, dOut] });
  } else if (style === "upvc") {
    const dOut = half - fOut + 0.035;
    boxes.unshift({ mat: "sill", p: [cx, y - 0.012, out * (fOut + dOut / 2)], s: [w + 0.04, 0.024, dOut] });
  }
  return boxes;
}

/**
 * A door leaf hinged at local (hx, hz), `len` long, opened by `ang` towards
 * the side `swing` (+1 or -1 along z), with its far end pointing along
 * `toward` (+1 or -1 along x) when closed. `body` builds the leaf's parts in
 * its own frame: x from the hinge along the leaf, z through its thickness.
 */
function leaf(hx: number, hz: number, len: number, toward: number, swing: number, ang: number, body: (len: number) => Box[]): Box[] {
  const dx = toward * Math.cos(ang);
  const dz = swing * Math.sin(ang);
  return place(body(len), [hx, 0, hz], rotTo(dx, dz));
}

/** Lever handles on both faces of a leaf `len` long and `t` thick, near its far edge. */
function levers(len: number, t: number, y = 1.0): Box[] {
  const b: Box[] = [];
  for (const side of [1, -1]) {
    b.push({ mat: "metal", p: [len - 0.07, y, side * (t / 2 + 0.03)], s: [0.025, 0.025, 0.06] });
    b.push({ mat: "metal", p: [len - 0.12, y, side * (t / 2 + 0.06)], s: [0.12, 0.022, 0.022] });
  }
  return b;
}

/** Raised panels (x0, x1, y0, y1 in the leaf's frame) standing on the given faces of a leaf `t` thick. */
function raised(rects: [number, number, number, number][], t: number, faces: number[], d = 0.008): Box[] {
  const b: Box[] = [];
  for (const side of faces)
    for (const [x0, x1, y0, y1] of rects)
      if (x1 - x0 > 0.04 && y1 - y0 > 0.04) b.push({ mat: "panel", p: [(x0 + x1) / 2, (y0 + y1) / 2, (side * (t + d)) / 2], s: [x1 - x0, y1 - y0, d] });
  return b;
}

/** A flush or panelled leaf with lever handles on both faces near its far edge. */
function plainLeaf(height: number, t = 0.04, handle = true) {
  return (len: number): Box[] => {
    const b: Box[] = [{ mat: "leaf", p: [len / 2, 0.012 + height / 2, 0], s: [len, height, t] }];
    // Two shallow panels on each face give it a cottage-door look.
    for (const side of [1, -1])
      for (const [y0, y1] of [
        [0.15, 0.85],
        [1.05, height - 0.15],
      ])
        if (len > 0.45) b.push({ mat: "panel", p: [len / 2, (y0 + y1) / 2, (side * t) / 2], s: [len - 0.24, y1 - y0, 0.008] });
    if (handle) b.push(...levers(len, t));
    return b;
  };
}

/** Rows and columns of glass in a "glazed-15" door. */
export const GLAZED_15 = { cols: 3, rows: 5 };

/**
 * A door leaf in the given style, in its own frame: x from the hinge along
 * the leaf, y up from the floor, z through its thickness. `show` (+1 or -1)
 * is the face that is seen first: outside for external doors, the swing
 * side for internal ones; planks are ledged on the other face. A front door
 * (`front`) gets a letter plate and knob instead of lever handles.
 */
export function doorLeaf(style: DoorStyle, height: number, t: number, show: number, front = false) {
  const h = height;
  return (len: number): Box[] => {
    const b: Box[] = [];
    const lb = (x: number, y: number, w: number, hh: number, mat: PartMat = "leaf", d = t) => b.push({ mat, p: [x, y, 0], s: [w, hh, d] });
    /** Glass from x0 to x1 and y0 to y1 at the leaf's centre plane. */
    const pane = (x0: number, x1: number, y0: number, y1: number, mat: PartMat = "glass") =>
      b.push({ mat, p: [(x0 + x1) / 2, (y0 + y1) / 2, 0], s: [x1 - x0, y1 - y0, 0.012] });
    let letterY = 0.78;
    /** Contemporary styles get a long pull bar outside instead of a knob. */
    let bar = false;
    switch (style) {
      case "glazed":
        return glazedLeaf(h, t, !front)(len).concat(front ? frontFurniture(len, t, show, 0.08) : []);
      case "panel":
        b.push(...plainLeaf(h, t, false)(len));
        break;
      case "flush":
        lb(len / 2, 0.012 + h / 2, len, h);
        break;
      case "glazed-15": {
        // Stiles and rails round a 3 x 5 grid of small panes divided by glazing bars.
        const st = Math.min(0.1, len / 7);
        const top = 0.1;
        const bot = 0.22;
        const gb = 0.028;
        lb(st / 2, h / 2, st, h);
        lb(len - st / 2, h / 2, st, h);
        lb(len / 2, h - top / 2, len - 2 * st, top);
        lb(len / 2, bot / 2, len - 2 * st, bot);
        const gx0 = st;
        const gx1 = len - st;
        const gy0 = bot;
        const gy1 = h - top;
        const cw = (gx1 - gx0) / GLAZED_15.cols;
        const rh = (gy1 - gy0) / GLAZED_15.rows;
        for (let i = 1; i < GLAZED_15.cols; i++) lb(gx0 + i * cw, (gy0 + gy1) / 2, gb, gy1 - gy0, "leaf", t * 0.7);
        for (let j = 1; j < GLAZED_15.rows; j++) lb((gx0 + gx1) / 2, gy0 + j * rh, gx1 - gx0, gb, "leaf", t * 0.7);
        for (let i = 0; i < GLAZED_15.cols; i++)
          for (let j = 0; j < GLAZED_15.rows; j++)
            pane(gx0 + i * cw + (i ? gb / 2 : 0), gx0 + (i + 1) * cw - (i < GLAZED_15.cols - 1 ? gb / 2 : 0), gy0 + j * rh + (j ? gb / 2 : 0), gy0 + (j + 1) * rh - (j < GLAZED_15.rows - 1 ? gb / 2 : 0));
        break;
      }
      case "six-panel": {
        // Two columns of raised panels: short at the top, tall in the middle, medium at the bottom.
        lb(len / 2, 0.012 + h / 2, len, h);
        const st = Math.min(0.11, len / 7);
        const mid = Math.min(0.1, len / 8);
        const pw = (len - 2 * st - mid) / 2;
        const rows: [number, number][] = [
          [0.06, 0.36],
          [0.43, 0.76],
          [0.81, 0.94],
        ];
        const rects: [number, number, number, number][] = [];
        for (const [a, c] of rows)
          for (const x of [st, st + pw + mid]) rects.push([x, x + pw, 0.012 + a * h, 0.012 + c * h]);
        b.push(...raised(rects, t, [1, -1], 0.01));
        break;
      }
      case "half-glazed":
      case "half-glazed-2": {
        // Obscure glass over a solid lower half with raised panels, as on uPVC and composite doors.
        const two = style === "half-glazed-2";
        const st = Math.min(0.11, len / 6);
        const top = 0.11;
        const gy0 = 0.012 + h * 0.47;
        const gy1 = 0.012 + h - top;
        lb(len / 2, (0.012 + gy0) / 2, len, gy0 - 0.012);
        lb(st / 2, (gy0 + gy1) / 2, st, gy1 - gy0);
        lb(len - st / 2, (gy0 + gy1) / 2, st, gy1 - gy0);
        lb(len / 2, gy1 + top / 2, len, top);
        const mu = 0.08;
        if (two) {
          lb(len / 2, (gy0 + gy1) / 2, mu, gy1 - gy0);
          pane(st, len / 2 - mu / 2, gy0, gy1, "obscure");
          pane(len / 2 + mu / 2, len - st, gy0, gy1, "obscure");
        } else pane(st, len - st, gy0, gy1, "obscure");
        const py0 = 0.16;
        const py1 = gy0 - 0.1;
        b.push(...raised(two ? [[st, len / 2 - mu / 2, py0, py1], [len / 2 + mu / 2, len - st, py0, py1]] : [[st, len - st, py0, py1]], t, [1, -1], 0.01));
        letterY = gy0 - 0.14;
        break;
      }
      case "ledged": {
        // Vertical tongue-and-groove planks; three ledges on the back face.
        lb(len / 2, 0.012 + h / 2, len, h);
        const k = Math.max(3, Math.round(len / 0.11));
        for (let j = 1; j < k; j++)
          for (const side of [1, -1]) b.push({ mat: "groove", p: [(j * len) / k, 0.012 + h / 2, side * (t / 2 + 0.001)], s: [0.008, h - 0.01, 0.003] });
        for (const y of [0.25, h / 2, h - 0.25]) b.push({ mat: "leaf", p: [len / 2, 0.012 + y, -show * (t / 2 + 0.012)], s: [len - 0.06, 0.15, 0.024] });
        break;
      }
      case "strip": {
        // Contemporary composite: a flat leaf with a tall, narrow glazed strip towards the hinge side.
        lb(len / 2, 0.012 + h / 2, len, h);
        const sw = Math.min(0.14, len * 0.17);
        const x0 = Math.max(0.1, len * 0.14);
        b.push({ mat: "obscure", p: [x0 + sw / 2, h / 2 + 0.05, 0], s: [sw, h - 0.6, t + 0.01] });
        bar = true;
        break;
      }
      case "squares": {
        // Contemporary composite: three small square lights, one above another, in a flat leaf.
        lb(len / 2, 0.012 + h / 2, len, h);
        const q = Math.min(0.2, len * 0.24);
        for (let i = 0; i < 3; i++) b.push({ mat: "obscure", p: [len / 2, h - 0.42 - i * (q + 0.12), 0], s: [q, q, t + 0.01] });
        letterY = h - 0.42 - 2 * (q + 0.12) - q / 2 - 0.2;
        bar = true;
        break;
      }
      case "grooved": {
        // Contemporary aluminium look: a flat leaf with routed horizontal grooves on both faces.
        lb(len / 2, 0.012 + h / 2, len, h);
        const k = Math.max(4, Math.round((h - 0.5) / 0.2));
        for (let j = 0; j <= k; j++)
          for (const side of [1, -1]) b.push({ mat: "groove", p: [len / 2, 0.27 + (j * (h - 0.5)) / k, side * (t / 2 + 0.001)], s: [len - 0.16, 0.012, 0.003] });
        letterY = 0.27 + (h - 0.5) / k / 2;
        bar = true;
        break;
      }
      case "cottage": {
        // Vertical planks with a four-pane window in the top, ledged on the back below it.
        lb(len / 2, 0.012 + h / 2, len, h);
        const gy0 = h - 0.62;
        const gy1 = h - 0.16;
        const gx0 = 0.13;
        const gx1 = len - 0.13;
        const k = Math.max(3, Math.round(len / 0.11));
        for (let j = 1; j < k; j++)
          for (const side of [1, -1]) {
            const x = (j * len) / k;
            const through = x > gx0 && x < gx1;
            for (const [y0, y1] of through ? [[0.017, gy0], [gy1, h + 0.007]] : [[0.017, h + 0.007]])
              b.push({ mat: "groove", p: [x, (y0 + y1) / 2, side * (t / 2 + 0.001)], s: [0.008, y1 - y0, 0.003] });
          }
        b.push({ mat: "glass", p: [len / 2, (gy0 + gy1) / 2, 0], s: [gx1 - gx0, gy1 - gy0, t + 0.01] });
        const gb = 0.03;
        lb(len / 2, (gy0 + gy1) / 2, gb, gy1 - gy0, "leaf", t + 0.014);
        lb(len / 2, (gy0 + gy1) / 2, gx1 - gx0, gb, "leaf", t + 0.014);
        for (const y of [0.25, gy0 - 0.2]) b.push({ mat: "leaf", p: [len / 2, 0.012 + y, -show * (t / 2 + 0.012)], s: [len - 0.06, 0.15, 0.024] });
        break;
      }
      case "front": {
        // The classic front door: four panels under a glazed top light.
        lb(len / 2, 0.012 + h / 2, len, h);
        for (const [a, c] of [
          [0.2, 0.7],
          [0.85, h - 0.62],
        ])
          for (const x of [len / 4, (3 * len) / 4]) b.push({ mat: "panel", p: [x, (a + c) / 2, show * 0.028], s: [len / 2 - 0.1, c - a, 0.012] });
        b.push({ mat: "glass", p: [len / 2, h - 0.33, 0], s: [len - 0.16, 0.42, t + 0.01] });
        break;
      }
    }
    b.push(...(front ? frontFurniture(len, t, show, letterY, bar) : levers(len, t)));
    return b;
  };
}

/** Letter plate on the face `show` at height y, and a knob on each face near the far edge (or, with `bar`, a long pull bar outside). */
function frontFurniture(len: number, t: number, show: number, y: number, bar = false): Box[] {
  const b: Box[] = [{ mat: "metal", p: [len / 2, y, show * (t / 2 + 0.007)], s: [0.28, 0.05, 0.012] }];
  if (bar) {
    const z = show * (t / 2 + 0.05);
    b.push({ mat: "metal", p: [len - 0.1, 1.05, z], s: [0.03, 0.9, 0.03] });
    for (const dy of [-0.35, 0.35]) b.push({ mat: "metal", p: [len - 0.1, 1.05 + dy, show * (t / 2 + 0.02)], s: [0.02, 0.02, 0.04] });
  } else b.push({ mat: "metal", p: [len - 0.1, 1.0, show * (t / 2 + 0.02)], s: [0.05, 0.05, 0.05] });
  b.push({ mat: "metal", p: [len - 0.1, 1.0, -show * (t / 2 + 0.02)], s: [0.03, 0.03, 0.05] });
  return b;
}

/** A glazed leaf or panel: stiles, rails, a kick rail and glass. */
function glazedLeaf(height: number, t = 0.06, handle = true) {
  return (len: number): Box[] => {
    const st = Math.min(0.08, len / 5);
    const kick = 0.16;
    const b: Box[] = [
      { mat: "frame", p: [st / 2, height / 2, 0], s: [st, height, t] },
      { mat: "frame", p: [len - st / 2, height / 2, 0], s: [st, height, t] },
      { mat: "frame", p: [len / 2, height - st / 2, 0], s: [len, st, t] },
      { mat: "frame", p: [len / 2, kick / 2, 0], s: [len, kick, t] },
      { mat: "glass", p: [len / 2, (kick + height - st) / 2, 0], s: [len - 2 * st, height - st - kick, 0.012] },
    ];
    if (handle)
      for (const side of [1, -1]) b.push({ mat: "metal", p: [len - st / 2, 1.0, side * (t / 2 + 0.02)], s: [0.025, 0.14, 0.03] });
    return b;
  };
}

/** Outer frame (jambs and head) of an external door, and a threshold. */
function doorFrame(w: number, h: number, z: number): Box[] {
  return [
    { mat: "frame", p: [-w / 2 + FW / 2, h / 2, z], s: [FW, h, FD] },
    { mat: "frame", p: [w / 2 - FW / 2, h / 2, z], s: [FW, h, FD] },
    { mat: "frame", p: [0, h - FW / 2, z], s: [w, FW, FD] },
    { mat: "threshold", p: [0, 0.015, z], s: [w, 0.03, FD + 0.04] },
  ];
}

/**
 * Lining and architraves of an internal door: the lining covers the reveal
 * through the wall and the architrave trims both faces.
 */
function doorLining(w: number, h: number, wallT: number, mat: PartMat = "lining"): Box[] {
  const lt = 0.025;
  const aw = 0.065;
  const b: Box[] = [
    { mat, p: [-w / 2 + lt / 2, h / 2, 0], s: [lt, h, wallT + 0.004] },
    { mat, p: [w / 2 - lt / 2, h / 2, 0], s: [lt, h, wallT + 0.004] },
    { mat, p: [0, h - lt / 2, 0], s: [w, lt, wallT + 0.004] },
  ];
  for (const side of [1, -1]) {
    const z = side * (wallT / 2 + 0.008);
    b.push(
      { mat, p: [-w / 2 - aw / 2 + lt, (h + aw) / 2, z], s: [aw, h + aw, 0.016] },
      { mat, p: [w / 2 + aw / 2 - lt, (h + aw) / 2, z], s: [aw, h + aw, 0.016] },
      { mat, p: [0, h + aw / 2, z], s: [w + 2 * aw - 2 * lt, aw, 0.016] },
    );
  }
  return b;
}

/** Which side a door swings to: inwards on an external wall, +z inside, reversed by flipSwing. */
function swingSide(op: Opening, out: number, outwards = false): number {
  const base = out ? (outwards ? out : -out) : 1;
  return op.flipSwing ? -base : base;
}

/** Parts for any opening except bays (see bayParts). */
export function openingParts(pl: OpeningPlacement, wallT: number, out: 1 | -1 | 0, doorsOpen = true): OpeningParts {
  const op = pl.opening;
  const w = pl.width;
  const { y0, y1 } = pl;
  const hinge = op.flipHinge ? 1 : -1; // jamb the hinges are on, along x
  const zf = frameZ(wallT, out);
  const boxes: Box[] = [];
  switch (op.kind) {
    case "gap":
    case "bay":
      break;
    case "window": {
      boxes.push(...glazedFrame(-w / 2, w / 2, y0, y1, zf, casements(w), out || 1, undefined, op.glazing));
      boxes.push(...sills(-w / 2, w / 2, y0, wallT, out, op.sillStyle));
      break;
    }
    case "door": {
      const s = swingSide(op, out);
      const ang = openAngle(op, 75, doorsOpen);
      const style = resolvedStyle(op, !!out) as DoorStyle;
      if (out) {
        // External door (back door): frame near the outside, leaf opening inwards (or shut, in the frame).
        boxes.push(...doorFrame(w, y1, zf));
        const lw = w - 2 * FW;
        const hz = ang ? zf + s * (FD / 2) : zf;
        boxes.push(...leaf(hinge * (lw / 2), hz, lw, -hinge, s, ang, doorLeaf(style, y1 - FW - 0.02, 0.05, out * -hinge)));
      } else {
        boxes.push(...doorLining(w, y1, wallT));
        const lh = y1 - 0.03;
        const inner = w - 0.05;
        const hz = s * (wallT / 2 - 0.02);
        if (w > 1.25) {
          // Wide openings get a pair of leaves.
          boxes.push(...leaf(-inner / 2, hz, inner / 2, 1, s, ang, doorLeaf(style, lh, 0.04, s)));
          boxes.push(...leaf(inner / 2, hz, inner / 2, -1, s, ang, doorLeaf(style, lh, 0.04, -s)));
        } else {
          boxes.push(...leaf(hinge * (inner / 2), hz, inner, -hinge, s, ang, doorLeaf(style, lh, 0.04, s * -hinge)));
        }
      }
      break;
    }
    case "front": {
      // Front door, shut unless openDeg says otherwise (and doors are shown open), with a letter plate and
      // knob, and any full-height side lights in the same frame, each past a mullion.
      boxes.push(...doorFrame(w, y1, zf));
      const unit = frontUnit(op, w);
      /** Inner edge of a span's end: inside the outer jamb, or half a mullion from its centre. */
      const inner = (x: number, dir: number) => x + dir * (Math.abs(Math.abs(x) - w / 2) < 1e-9 ? FW : FW / 2);
      for (const [a, b] of unit.lights) {
        const m = Math.abs(Math.abs(a) - w / 2) < 1e-9 ? b : a;
        boxes.push({ mat: "frame", p: [m, y1 / 2, zf], s: [FW, y1, FD] });
        const ga = inner(a, 1);
        const gb = inner(b, -1);
        const rail = 0.03 + FW;
        boxes.push({ mat: "frame", p: [(ga + gb) / 2, rail / 2 + 0.015, zf], s: [gb - ga, rail - 0.03, FD] });
        boxes.push({ mat: "glass", p: [(ga + gb) / 2, (rail + y1 - FW) / 2, zf], s: [gb - ga, y1 - FW - rail, 0.012] });
      }
      const la = inner(unit.door[0], 1);
      const lb = inner(unit.door[1], -1);
      const lw = lb - la;
      const lh = y1 - FW - 0.02;
      const f = out || 1;
      const s = swingSide(op, out);
      const ang = openAngle(op, 0, doorsOpen);
      const style = resolvedStyle(op, true) as DoorStyle;
      boxes.push(...leaf((la + lb) / 2 + hinge * (lw / 2), ang ? zf + s * (FD / 2) : zf, lw, -hinge, s, ang, doorLeaf(style, lh, 0.05, f * -hinge, true)));
      break;
    }
    case "garage": {
      // Up-and-over door in a frame near the outside.
      boxes.push(...doorFrame(w, y1, zf));
      const f = out || 1;
      const lw = w - 2 * FW;
      const lh = y1 - FW;
      boxes.push({ mat: "leaf", p: [0, lh / 2, zf], s: [lw, lh, 0.04] });
      if (resolvedStyle(op, true) === "up-over") {
        // One leaf with 3 x 2 raised panels and a central T-handle.
        const m = 0.1;
        const g = 0.07;
        const pw = (lw - 2 * m - 2 * g) / 3;
        const ph = (lh - 2 * m - g) / 2;
        for (let r = 0; r < 2; r++)
          for (let c = 0; c < 3; c++)
            boxes.push({ mat: "panel", p: [-lw / 2 + m + c * (pw + g) + pw / 2, m + r * (ph + g) + ph / 2, zf + f * 0.027], s: [pw, ph, 0.014] });
        boxes.push({ mat: "metal", p: [0, lh * 0.6, zf + f * 0.04], s: [0.05, 0.09, 0.03] });
        boxes.push({ mat: "metal", p: [0, lh * 0.6 - 0.03, zf + f * 0.055], s: [0.14, 0.025, 0.02] });
        break;
      }
      const cols = w > 2.8 ? 3 : 2;
      const rows = 3;
      const pw = lw / cols;
      const ph = (lh - 0.05) / rows;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          boxes.push({ mat: "panel", p: [-lw / 2 + (c + 0.5) * pw, 0.05 + (r + 0.5) * ph, zf + f * 0.024], s: [pw - 0.1, ph - 0.1, 0.012] });
      boxes.push({ mat: "metal", p: [0, 1.0, zf + f * 0.035], s: [0.16, 0.04, 0.03] });
      break;
    }
    case "patio": {
      // Sliding doors: two or three glazed panels on staggered tracks.
      boxes.push(...doorFrame(w, y1, zf));
      const n = w > 3.2 ? 3 : 2;
      const lw = w - 2 * FW;
      const pw = lw / n + 0.04;
      for (let i = 0; i < n; i++) {
        const x = -lw / 2 + ((i + 0.5) * lw) / n;
        const dz = (i % 2 ? 1 : -1) * 0.018;
        boxes.push(...place(glazedLeaf(y1 - FW - 0.03, 0.03, i === 0 || i === n - 1)(pw), [x - pw / 2, 0.03, zf + dz], 0));
      }
      break;
    }
    case "french": {
      // A pair of glazed leaves, open; French doors open outwards by default.
      boxes.push(...doorFrame(w, y1, zf));
      const s = swingSide(op, out, true);
      const lw = (w - 2 * FW) / 2;
      const hz = zf + s * (FD / 2);
      const lh = y1 - FW - 0.02;
      const ang = openAngle(op, 80, doorsOpen);
      boxes.push(...leaf(-lw, ang ? hz : zf, lw, 1, s, ang, glazedLeaf(lh, 0.055)));
      boxes.push(...leaf(lw, ang ? hz : zf, lw, -1, s, ang, glazedLeaf(lh, 0.055)));
      break;
    }
    case "archway":
      // Open and doorless: just the lining through the wall and architraves on both faces.
      boxes.push(...doorLining(w, y1, wallT, "leaf"));
      break;
    case "bifold": {
      // Internal bi-folds get a lining like internal doors, external ones a frame and threshold.
      const layout = bifoldLayout(w, !out);
      boxes.push(...(out ? doorFrame(w, y1, zf) : doorLining(w, y1, wallT)));
      boxes.push(...bifoldStack(layout, y1 - FW - 0.02, zf, hinge, swingSide(op, out, true), !doorsOpen));
      break;
    }
  }
  return { boxes, quads: [] };
}

/**
 * Bi-fold panels folded into a concertina stack against one jamb: each
 * panel stands nearly square to the wall, alternately folding out and back.
 */
function bifoldStack(l: BifoldLayout, h: number, zf: number, side: number, swing: number, shut = false): Box[] {
  const boxes: Box[] = [];
  if (shut) {
    // Closed: the panels lie flat in a row across the opening.
    for (let i = 0; i < l.n; i++) boxes.push(...place(glazedLeaf(h, 0.05, i === l.n - 1)(l.panel), [side * (l.clear / 2 - i * l.panel), 0.015, zf], rotTo(-side, 0)));
    return boxes;
  }
  let x = side * (l.clear / 2);
  let z = zf + swing * (FD / 2);
  for (let i = 0; i < l.n; i++) {
    const dx = -side * l.run;
    const dz = (i % 2 ? -1 : 1) * swing * l.throw;
    boxes.push(...place(glazedLeaf(h, 0.05, i === l.n - 1)(l.panel), [x, 0.015, z], rotTo(dx, dz)));
    x += dx;
    z += dz;
  }
  return boxes;
}

/**
 * Plan outline of a canted bay in the opening's local frame (x along the
 * wall, z outward from the wall's centre line): a front face parallel to the
 * wall and two sides at 45 degrees. Starts and ends on the wall's outer face.
 */
export function bayOutline(width: number, wallT: number, depth = DEFAULT_BAY_DEPTH): { x: number; z: number }[] {
  const d = Math.max(0.1, Math.min(depth, (width - 0.4) / 2));
  const z0 = wallT / 2;
  return [
    { x: -width / 2, z: z0 },
    { x: -width / 2 + d, z: z0 + d },
    { x: width / 2 - d, z: z0 + d },
    { x: width / 2, z: z0 },
  ];
}

type P2 = { x: number; z: number };

/** Offset an open polyline by `d` to its left (x, z plan, z "up"), mitring the corners. */
function offsetPolyline(pts: P2[], d: number): P2[] {
  const normals = pts.slice(1).map((p, i) => {
    const dx = p.x - pts[i].x;
    const dz = p.z - pts[i].z;
    const l = Math.hypot(dx, dz);
    return { x: -dz / l, z: dx / l };
  });
  return pts.map((p, i) => {
    const a = normals[Math.max(0, i - 1)];
    const b = normals[Math.min(normals.length - 1, i)];
    const m = { x: a.x + b.x, z: a.z + b.z };
    const k = d / (1 + a.x * b.x + a.z * b.z);
    return { x: p.x + m.x * k, z: p.z + m.z * k };
  });
}

/**
 * A canted bay: a solid base up to the sill, glazed on all three faces up
 * to the head, a fascia and a small lead-covered roof hipped at the cants,
 * a ceiling inside, and the room's floor carried out into it. `out` must be
 * non-zero (bays only make sense on an external wall).
 */
export function bayParts(
  pl: OpeningPlacement,
  wallT: number,
  out: 1 | -1,
  roomId: string | null,
  opts: { sill: number; plinth: number; depth?: number },
): OpeningParts {
  const w = pl.width;
  const head = pl.y1;
  const sill = Math.min(opts.sill, head - 0.3);
  const outline = bayOutline(w, wallT, opts.depth);
  // Work with z pointing outwards and flip at the end.
  const BT = 0.2; // base wall thickness
  const z0 = outline[0].z;
  const inner = toWallFace(offsetPolyline(outline, -BT), z0);
  const quads: FaceQuad[] = [];
  const boxes: Box[] = [];
  const inside: FaceSlot = roomId ? { kind: "inside", roomId } : { kind: "outside", roomId: null };
  const outside: FaceSlot = { kind: "outside", roomId };
  const V = (p: P2, y: number): V3 => [p.x, y, p.z * out];
  /** Vertical face from p to q between y0 and y1, normal to its right (outward for the outline). */
  const wall = (p: P2, q: P2, y0: number, y1: number, slot: FaceSlot, flip = false) => {
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const l = Math.hypot(dx, dz);
    const f = flip ? -1 : 1;
    const n: V3 = [(-dz / l) * f, 0, (dx / l) * f * out];
    quads.push(orient({ v: [V(p, y0), V(q, y0), V(q, y1), V(p, y1)], n, uv: uvs(p, q, y0, y1), slot }));
  };
  for (let i = 0; i < 3; i++) {
    wall(outline[i], outline[i + 1], opts.plinth, sill, outside);
    wall(inner[i], inner[i + 1], 0, sill, inside, true);
    // Fascia band above the glazing.
    wall(outline[i], outline[i + 1], head, head + 0.16, { kind: "part", mat: "frame" });
    // Top of the base: a board right across, inside and out.
    quads.push(orient({ v: [V(outline[i], sill), V(outline[i + 1], sill), V(inner[i + 1], sill), V(inner[i], sill)], n: [0, 1, 0], uv: flatUv(), slot: { kind: "part", mat: "sill" } }));
  }
  // Short returns where the base meets the main wall's hole.
  for (const i of [0, 3]) {
    const a = outline[i];
    const b = inner[i];
    quads.push(orient({ v: [V(a, 0), V(b, 0), V(b, sill), V(a, sill)], n: [0, 0, -out], uv: flatUv(), slot: inside }));
  }
  // Glazing on each face, set into the base wall.
  for (let i = 0; i < 3; i++) {
    const p = outline[i];
    const q = outline[i + 1];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const l = Math.hypot(dx, dz);
    const ux = dx / l;
    const uz = dz / l;
    // Inward normal (towards the room).
    const nx = uz;
    const nz = -ux;
    const inset = 0.07;
    const cx = (p.x + q.x) / 2 + nx * inset;
    const cz = (p.z + q.z) / 2 + nz * inset;
    const ry = rotTo(ux, uz * out);
    // In this face's own frame +z points out of the bay when out = 1.
    const frame = glazedFrame(-l / 2, l / 2, sill, head, 0, casements(l), out, head - sill > 1.05, pl.opening.glazing);
    boxes.push(...place(frame, [cx, 0, cz * out], ry));
  }
  // Corner posts where the faces meet.
  for (const i of [1, 2]) boxes.push({ mat: "frame", p: [outline[i].x, (sill + head) / 2, (outline[i].z - 0.05) * out], s: [0.09, head - sill, 0.09], ry: Math.PI / 4 });
  // Ceiling inside the bay at the head.
  const ceil = [outline[0], outline[1], outline[2], outline[3]];
  quads.push(orient({ v: [V(ceil[0], head), V(ceil[1], head), V(ceil[2], head), V(ceil[3], head)], n: [0, -1, 0], uv: flatUv(), slot: inside }));
  // Lead roof: eaves just outside the fascia, rising to the wall at 20 degrees, hipped at the cants.
  const OV = 0.06;
  const eaves = toWallFace(offsetPolyline(outline, OV), z0);
  const ey = head + 0.16;
  const D = eaves[1].z - outline[0].z;
  const rise = D * Math.tan((20 * Math.PI) / 180);
  // Hip tops: on the wall face, on the bisector of each cant corner.
  const hipX = (c: P2, s: number) => c.x + s * D * Math.tan(Math.PI / 8);
  const t1: P2 = { x: hipX(eaves[1], 1), z: outline[0].z };
  const t2: P2 = { x: hipX(eaves[2], -1), z: outline[0].z };
  const lead: FaceSlot = { kind: "part", mat: "lead" };
  const up = (a: V3, b: V3, c: V3): V3 => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
    const l = Math.hypot(...n);
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const roofFace = (v: [V3, V3, V3, V3]) => {
    const n = up(v[0], v[1], v[2]);
    quads.push(orient({ v, n, uv: flatUv(), slot: lead }));
    // Underside, seen from below the eaves.
    quads.push(orient({ v: [v[0], v[3], v[2], v[1]], n: [-n[0], -n[1], -n[2]], uv: flatUv(), slot: lead }));
  };
  const E = (p: P2) => V(p, ey);
  const T = (p: P2) => V(p, ey + rise);
  roofFace([E(eaves[1]), E(eaves[2]), T(t2), T(t1)]);
  roofFace([E(eaves[0]), E(eaves[1]), T(t1), T(t1)]);
  roofFace([E(eaves[2]), E(eaves[3]), T(t2), T(t2)]);
  // Floor carried from the wall's centre line, through the hole, out to the inside of the base.
  const bayFloor = [{ x: -w / 2, z: 0 }, { x: -w / 2, z: z0 }, ...inner, { x: w / 2, z: z0 }, { x: w / 2, z: 0 }].map((p) => ({ x: p.x, z: p.z * out }));
  return { boxes, quads, bayFloor };
}

/** Slide the end points of an offset bay outline along their end segments onto the wall's outer face z = z0. */
function toWallFace(pts: P2[], z0: number): P2[] {
  return pts.map((p, i) => {
    if (i !== 0 && i !== pts.length - 1) return p;
    const q = pts[i === 0 ? 1 : pts.length - 2];
    const t = (z0 - q.z) / (p.z - q.z);
    return { x: q.x + (p.x - q.x) * t, z: z0 };
  });
}

/** Metre UVs for a vertical face from p to q, so finishes keep their scale. */
function uvs(p: P2, q: P2, y0: number, y1: number): [number, number][] {
  const l = Math.hypot(q.x - p.x, q.z - p.z);
  return [
    [0, y0],
    [l, y0],
    [l, y1],
    [0, y1],
  ];
}

function flatUv(): [number, number][] {
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
}

/** Rewind a quad so it faces along its normal (Newell's method copes with a repeated corner). */
function orient(q: FaceQuad): FaceQuad {
  const cr = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const a = q.v[i];
    const b = q.v[(i + 1) % 4];
    cr[0] += (a[1] - b[1]) * (a[2] + b[2]);
    cr[1] += (a[2] - b[2]) * (a[0] + b[0]);
    cr[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  if (cr[0] * q.n[0] + cr[1] * q.n[1] + cr[2] * q.n[2] >= 0) return q;
  return { ...q, v: [q.v[0], q.v[3], q.v[2], q.v[1]], uv: [q.uv[0], q.uv[3], q.uv[2], q.uv[1]] };
}

/** The six faces of a box in its own frame, before placing. */
const BOX_FACES: { n: V3; c: [V3, V3, V3, V3] }[] = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

/** A placed opening's local frame: centre on the plan and the wall direction. */
export interface LocalFrame {
  centre: V2;
  dir: V2;
}

/** Map a local point (x along the wall, y up, z along +n) to world (x, y, z). */
export function toWorld3(f: LocalFrame, p: V3, y0 = 0): V3 {
  const nx = -f.dir.y;
  const nz = f.dir.x;
  return [f.centre.x + f.dir.x * p[0] + nx * p[2], y0 + p[1], f.centre.y + f.dir.y * p[0] + nz * p[2]];
}

/** Rotate a local direction into world. */
function dirToWorld(f: LocalFrame, d: V3): V3 {
  return [f.dir.x * d[0] - f.dir.y * d[2], d[1], f.dir.y * d[0] + f.dir.x * d[2]];
}

/** Boxes as world-space quads (six faces each, UVs in metres). */
export function boxQuads(boxes: Box[], f: LocalFrame): FaceQuad[] {
  const out: FaceQuad[] = [];
  for (const b of boxes) {
    const c = Math.cos(b.ry ?? 0);
    const s = Math.sin(b.ry ?? 0);
    const rot = (v: V3): V3 => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
    const hs: V3 = [b.s[0] / 2, b.s[1] / 2, b.s[2] / 2];
    for (const face of BOX_FACES) {
      const v = face.c.map((k) => {
        const r = rot([k[0] * hs[0], k[1] * hs[1], k[2] * hs[2]]);
        return toWorld3(f, [b.p[0] + r[0], b.p[1] + r[1], b.p[2] + r[2]]);
      }) as [V3, V3, V3, V3];
      const n = dirToWorld(f, rot(face.n));
      const du = face.n[0] ? b.s[2] : b.s[0];
      const dv = face.n[1] ? b.s[2] : b.s[1];
      out.push({ v, n, uv: [[0, 0], [du, 0], [du, dv], [0, dv]], slot: { kind: "part", mat: b.mat } });
    }
  }
  return out;
}

/** Local quads (bay faces) moved to world. */
export function quadsToWorld(quads: FaceQuad[], f: LocalFrame): FaceQuad[] {
  return quads.map((q) => ({ ...q, v: q.v.map((p) => toWorld3(f, p)) as [V3, V3, V3, V3], n: dirToWorld(f, q.n) }));
}
