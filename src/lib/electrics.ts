import type { Circuit, CircuitKind, Fixture, Floor, HouseModel, Pt } from "../types";
import { byId, isElectricalItem, isFittedLight, gridOf, type CatalogueItem, type Symbol } from "./catalogue";
import { pointInPolygon, toWorld } from "./geometry";
import { fixtureBox } from "./planMath";

/**
 * Electrics mode and the wiring guide: which fixtures are electrical points, which room each is in, their
 * numbers (per room, a prefix per kind: L1, SW1, S1 ...), the switch-to-light links and the circuits. Pure;
 * the plan layer (editor/plan/layers/Electrics.tsx), the panel (components/ElectricsPanel.tsx), the guide
 * (lib/wiringGuide.ts) and the costs (lib/report.ts electricalChanges) read it. See docs/electrics-plan.md.
 */

// ---------------------------------------------------------------------------
// Kinds

/** What an electrical point is, for numbering, the legend groups and the totals. */
export type PointKind = "light" | "switch" | "socket" | "connection" | "appliance" | "alarm" | "data" | "board";
/** Kinds in schedule order. */
export const POINT_KINDS: PointKind[] = ["board", "light", "switch", "socket", "connection", "appliance", "alarm", "data"];
/** Number prefix per kind; numbers restart in every room. */
export const POINT_PREFIX: Record<PointKind, string> = { light: "L", switch: "SW", socket: "S", connection: "C", appliance: "P", alarm: "A", data: "D", board: "CU" };
export const POINT_KIND_LABEL: Record<PointKind, string> = {
  light: "Lights",
  switch: "Switches",
  socket: "Sockets",
  connection: "Spurs and isolators",
  appliance: "Fixed appliances",
  alarm: "Alarms",
  data: "TV and data",
  board: "Consumer unit",
};

/** Every electrical symbol's kind; Lighting entries are lights whatever their symbol. */
const SYMBOL_KIND: Partial<Record<Symbol, PointKind>> = {
  "switch-1g": "switch",
  "switch-2g": "switch",
  "switch-2way": "switch",
  "switch-dimmer": "switch",
  "switch-pull": "switch",
  "socket-1": "socket",
  "socket-2": "socket",
  "socket-usb": "socket",
  "socket-floor": "socket",
  "socket-outdoor": "socket",
  "shaver-socket": "socket",
  "fused-spur": "connection",
  "cooker-switch": "connection",
  "cooker-outlet": "connection",
  "shower-point": "appliance",
  "extractor-fan": "appliance",
  thermostat: "appliance",
  "bell-push": "appliance",
  "bell-chime": "appliance",
  "ev-charger": "appliance",
  "smoke-alarm": "alarm",
  "heat-alarm": "alarm",
  "co-alarm": "alarm",
  "tv-point": "data",
  "data-point": "data",
  "consumer-unit": "board",
};

/** The point kind of a catalogue item, or undefined when it is not an electrical point (furniture, plug-in lamps). */
export function pointKind(item: Pick<CatalogueItem, "category" | "symbol">): PointKind | undefined {
  if (!isElectricalItem(item)) return undefined;
  if (isFittedLight(item)) return "light";
  return SYMBOL_KIND[item.symbol] ?? "appliance";
}
export const isSwitchItem = (item: Pick<CatalogueItem, "category" | "symbol">): boolean => pointKind(item) === "switch";
/** Whether a fixture (by its catalogue id) is an electrical point: what Electrics mode selects. */
export const isElectricalFixture = (fx: Pick<Fixture, "type">): boolean => {
  const item = byId(fx.type);
  return !!item && isElectricalItem(item);
};

/** How many of the point there are for counts and costs: a downlight grid counts every bulb, anything else 1. */
export function pointQuantity(fx: Pick<Fixture, "cols" | "rows" | "pitch">, item: Pick<CatalogueItem, "grid">): number {
  const g = gridOf(fx, item);
  return g ? g.cols * g.rows : 1;
}

/**
 * Height of a wall point's centre above the floor, metres (base `mount` plus half its height); for a ceiling item
 * the height of its base below the ceiling; 0 for a floor socket. Pass the model's ceiling height.
 */
export function centreHeight(fx: Fixture, item: CatalogueItem, ceiling: number): number {
  const b = fixtureBox(fx, item, ceiling);
  return item.ceiling ? b.z0 : b.z0 + b.h / 2;
}

/** The `mount` (base height) that puts a wall point's centre at `centre` metres: what the inspector's centre-height field writes. */
export function mountForCentre(centre: number, fx: Fixture, item: CatalogueItem): number {
  return Math.max(0, Math.round((centre - (fx.h ?? item.h) / 2) * 1000) / 1000);
}

/** Whether a point sits on a wall (its back against it): not a ceiling item and not a floor socket. */
export const isWallPoint = (item: Pick<CatalogueItem, "ceiling" | "symbol">): boolean => !item.ceiling && item.symbol !== "socket-floor";

/**
 * Where a point's plan symbol is centred relative to the fixture centre, metres in the plan frame (x right, y down):
 * a wall point's symbol (`glyph` metres square) keeps its back on the wall, so it is pushed into the room by half the
 * symbol less half the plate's depth, along the fixture's local +y turned by `rot` (clockwise). Others: no offset.
 * The plan layer and the printed guide both place symbols with it.
 */
export function glyphOffset(fx: Pick<Fixture, "rot" | "d">, item: Pick<CatalogueItem, "ceiling" | "symbol" | "d">, glyph: number): { x: number; y: number } {
  if (!isWallPoint(item)) return { x: 0, y: 0 };
  const push = glyph / 2 - (fx.d ?? item.d) / 2;
  const a = (fx.rot * Math.PI) / 180;
  return { x: -Math.sin(a) * push, y: Math.cos(a) * push };
}

// ---------------------------------------------------------------------------
// Rooms and numbering

/** Name of the group for points outside every room (and for every outdoor item). */
export const OUTSIDE = "Outside";
/** A point whose centre is in no room still belongs to the nearest room within this distance (metres): a point in a wall's thickness. */
export const ROOM_REACH = 0.35;

export interface RoomRef {
  /** Stable grouping key: `${floorId}:${roomId}` or `${floorId}:outside`. */
  key: string;
  name: string;
  floorId: string;
  /** Undefined for Outside. */
  roomId?: string;
}

function segDistPx(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/**
 * The room a point belongs to: the last room (topmost, as the plan draws them) whose polygon contains its centre; else
 * the nearest room within ROOM_REACH; else Outside. Outdoor items (CatalogueItem.outdoor) are always Outside.
 */
export function roomOf(floor: Floor, fx: Pick<Fixture, "x" | "y">, item?: Pick<CatalogueItem, "outdoor">): RoomRef {
  const outside: RoomRef = { key: `${floor.id}:outside`, name: OUTSIDE, floorId: floor.id };
  if (item?.outdoor) return outside;
  const p = { x: fx.x, y: fx.y };
  for (let i = floor.rooms.length - 1; i >= 0; i--) {
    const r = floor.rooms[i];
    if (pointInPolygon(p, r.polygon)) return { key: `${floor.id}:${r.id}`, name: r.name, floorId: floor.id, roomId: r.id };
  }
  let best: { id: string; name: string; d: number } | null = null;
  for (const r of floor.rooms) {
    for (let i = 0; i < r.polygon.length; i++) {
      const d = segDistPx(p, r.polygon[i], r.polygon[(i + 1) % r.polygon.length]);
      if (!best || d < best.d) best = { id: r.id, name: r.name, d };
    }
  }
  if (best && best.d <= ROOM_REACH * floor.pxPerM) return { key: `${floor.id}:${best.id}`, name: best.name, floorId: floor.id, roomId: best.id };
  return outside;
}

/** One electrical point on a floor. */
export interface Point {
  fx: Fixture;
  item: CatalogueItem;
  kind: PointKind;
  floor: Floor;
  room: RoomRef;
  /** Centre in world metres (x right, y = plan y towards the front). */
  at: { x: number; y: number };
  /** pointQuantity: bulbs of a grid, else 1. */
  quantity: number;
}

/** The floor's electrical points, in fixture order. */
export function pointsOf(floor: Floor): Point[] {
  const out: Point[] = [];
  for (const fx of floor.fixtures ?? []) {
    const item = byId(fx.type);
    const kind = item && pointKind(item);
    if (!item || !kind) continue;
    out.push({ fx, item, kind, floor, room: roomOf(floor, fx, item), at: toWorld(floor, fx), quantity: pointQuantity(fx, item) });
  }
  return out;
}

export interface NumberedPoint extends Point {
  /** 1-based number within its room and kind. */
  n: number;
  /** Prefix and number, e.g. "SW2"; with the room name it names the point ("Kitchen SW2"). */
  label: string;
}

/** Rows of this depth (metres) read left to right when numbering, top of the plan first. */
const READING_ROW = 0.5;

/**
 * Every point of the model numbered: floors by level, rooms in the floor's order with Outside last, kinds in
 * POINT_KINDS order, and within a room and kind in reading order (top of the plan first, in 0.5 m rows, then left to
 * right; ties by id). Numbers restart in every room for every kind.
 */
export function numberPoints(model: HouseModel): NumberedPoint[] {
  const out: NumberedPoint[] = [];
  for (const floor of [...model.floors].sort((a, b) => a.level - b.level)) {
    const pts = pointsOf(floor);
    const roomOrder = [...floor.rooms.map((r) => `${floor.id}:${r.id}`), `${floor.id}:outside`];
    for (const key of roomOrder) {
      const inRoom = pts.filter((p) => p.room.key === key);
      for (const kind of POINT_KINDS) {
        const list = inRoom
          .filter((p) => p.kind === kind)
          .sort((a, b) => Math.round(a.at.y / READING_ROW) - Math.round(b.at.y / READING_ROW) || a.at.x - b.at.x || (a.fx.id < b.fx.id ? -1 : a.fx.id > b.fx.id ? 1 : 0));
        list.forEach((p, i) => out.push({ ...p, n: i + 1, label: `${POINT_PREFIX[kind]}${i + 1}` }));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Switch-to-light links

const allFixtures = (model: HouseModel): Fixture[] => model.floors.flatMap((f) => f.fixtures ?? []);

/** For every light id, the switches (on any floor) whose `controls` list it. */
export function controlIndex(model: HouseModel): Map<string, Fixture[]> {
  const out = new Map<string, Fixture[]>();
  for (const sw of allFixtures(model)) {
    if (!sw.controls?.length) continue;
    const item = byId(sw.type);
    if (!item || !isSwitchItem(item)) continue;
    for (const id of sw.controls) out.set(id, [...(out.get(id) ?? []), sw]);
  }
  return out;
}

/** The switches controlling one light (for lib/lights.ts fixtureLit). */
export const controllersOf = (model: HouseModel, lightId: string): Fixture[] => controlIndex(model).get(lightId) ?? [];

/** The patch that links or unlinks `lightId` on a switch. */
export function toggleLink(sw: Pick<Fixture, "controls">, lightId: string): Pick<Fixture, "controls"> {
  const list = sw.controls ?? [];
  const next = list.includes(lightId) ? list.filter((id) => id !== lightId) : [...list, lightId];
  return { controls: next.length ? next : undefined };
}

/** A switch-to-light link between two numbered points (possibly on different floors). */
export interface Link {
  from: NumberedPoint;
  to: NumberedPoint;
}

/** Every link whose ends are both numbered points (a switch and a light); dangling ids are skipped. */
export function links(model: HouseModel, numbered: NumberedPoint[] = numberPoints(model)): Link[] {
  const byFx = new Map(numbered.map((p) => [p.fx.id, p]));
  const out: Link[] = [];
  for (const p of numbered) {
    if (p.kind !== "switch") continue;
    for (const id of p.fx.controls ?? []) {
      const to = byFx.get(id);
      if (to && to.kind === "light") out.push({ from: p, to });
    }
  }
  return out;
}

/** The model with every `controls` id that no longer names a light dropped (the same object when nothing changes). */
export function pruneLinks(model: HouseModel): HouseModel {
  const lights = new Set(allFixtures(model).filter((fx) => byId(fx.type) && pointKind(byId(fx.type)!) === "light").map((fx) => fx.id));
  let changed = false;
  const floors = model.floors.map((f) => {
    let fc = false;
    const fixtures = (f.fixtures ?? []).map((fx) => {
      if (!fx.controls) return fx;
      const keep = fx.controls.filter((id) => lights.has(id));
      if (keep.length === fx.controls.length) return fx;
      fc = true;
      return { ...fx, controls: keep.length ? keep : undefined };
    });
    if (!fc) return f;
    changed = true;
    return { ...f, fixtures };
  });
  return changed ? { ...model, floors } : model;
}

// ---------------------------------------------------------------------------
// Circuits

export const CIRCUIT_KINDS: CircuitKind[] = ["lighting", "ring", "radial", "cooker", "shower", "ev", "other"];
export const CIRCUIT_KIND_LABEL: Record<CircuitKind, string> = {
  lighting: "Lighting",
  ring: "Ring main",
  radial: "Radial",
  cooker: "Cooker",
  shower: "Shower",
  ev: "EV charger",
  other: "Other",
};

/** The list with a new, empty circuit `id` appended (the caller makes the id with uid()), named "<Kind> <n>" unless `name` is given. */
export function addCircuit(list: Circuit[] | undefined, kind: CircuitKind, id: string, name?: string): Circuit[] {
  const all = list ?? [];
  const n = all.filter((c) => c.kind === kind).length + 1;
  return [...all, { id, name: name?.trim() || `${CIRCUIT_KIND_LABEL[kind]} ${n}`, kind, points: [] }];
}

export function renameCircuit(list: Circuit[] | undefined, id: string, name: string): Circuit[] {
  return (list ?? []).map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c));
}

export function setCircuitKind(list: Circuit[] | undefined, id: string, kind: CircuitKind): Circuit[] {
  return (list ?? []).map((c) => (c.id === id ? { ...c, kind } : c));
}

export function deleteCircuit(list: Circuit[] | undefined, id: string): Circuit[] {
  return (list ?? []).filter((c) => c.id !== id);
}

/** Put the points on a circuit (taking them off any other); `circuitId` null takes them off every circuit. */
export function assignToCircuit(list: Circuit[] | undefined, circuitId: string | null, pointIds: string[]): Circuit[] {
  const ids = new Set(pointIds);
  return (list ?? []).map((c) => {
    const rest = c.points.filter((p) => !ids.has(p));
    return c.id === circuitId ? { ...c, points: [...rest, ...pointIds.filter((p, i) => pointIds.indexOf(p) === i)] } : rest.length === c.points.length ? c : { ...c, points: rest };
  });
}

/** The circuit a point is on, if any. */
export const circuitOf = (list: Circuit[] | undefined, fixtureId: string): Circuit | undefined => (list ?? []).find((c) => c.points.includes(fixtureId));

/** The circuits with ids that no longer name a fixture in the model dropped (the same array when nothing changes). */
export function pruneCircuits(model: HouseModel): Circuit[] | undefined {
  if (!model.circuits) return model.circuits;
  const live = new Set(allFixtures(model).map((fx) => fx.id));
  let changed = false;
  const next = model.circuits.map((c) => {
    const keep = c.points.filter((id) => live.has(id));
    if (keep.length === c.points.length) return c;
    changed = true;
    return { ...c, points: keep };
  });
  return changed ? next : model.circuits;
}

// ---------------------------------------------------------------------------
// Schedule (Dua Lipa: implement; see docs/electrics-plan.md section 5)

/** One row per numbered point: the CSV. */
export interface PointRow {
  id: string;
  floor: string;
  room: string;
  /** "SW2". */
  label: string;
  kind: PointKind;
  /** Catalogue name, e.g. "Socket (double)". */
  type: string;
  quantity: number;
  /** Centre height in mm for wall points, "Ceiling" for ceiling items, "Floor" for floor sockets. */
  height: string;
  circuit: string;
  /** The fixture's label, "Outdoor", and for a switch the lights it switches ("L1, L2" or "Hallway L1" in another room). */
  notes: string;
}

/** The schedule grouped for print: one row per room, point type, height and circuit, with the count and the labels. */
export interface ScheduleRow {
  floor: string;
  room: string;
  type: string;
  kind: PointKind;
  count: number;
  height: string;
  circuit: string;
  /** Labels of the points in the row, e.g. "S1–S4" or "S1, S3". */
  labels: string;
  notes: string;
}

export interface TotalRow {
  kind: PointKind;
  type: string;
  count: number;
}

export function pointRows(_model: HouseModel, _numbered?: NumberedPoint[]): PointRow[] {
  return [];
}

export function scheduleRows(_rows: PointRow[]): ScheduleRow[] {
  return [];
}

export function totals(_rows: PointRow[]): TotalRow[] {
  return [];
}
