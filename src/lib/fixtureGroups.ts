import type { Fixture, Pt } from "../types";
import { byId } from "./catalogue";
import { fixtureBox, rectCorners, turn } from "./planMath";

/** Plan-pixel rectangle. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The ids plus every member of any group one of them belongs to (ids not among the fixtures are dropped). */
export function expandToGroups(ids: Iterable<string>, fixtures: Fixture[]): string[] {
  const want = new Set(ids);
  const groups = new Set<string>();
  for (const f of fixtures) if (want.has(f.id) && f.groupId) groups.add(f.groupId);
  return fixtures.filter((f) => want.has(f.id) || (f.groupId && groups.has(f.groupId))).map((f) => f.id);
}

/** Drop groupId from groups left with fewer than two members. */
function pruneSingles(fixtures: Fixture[]): Fixture[] {
  const count = new Map<string, number>();
  for (const f of fixtures) if (f.groupId) count.set(f.groupId, (count.get(f.groupId) ?? 0) + 1);
  return fixtures.map((f) => {
    if (!f.groupId || (count.get(f.groupId) ?? 0) > 1) return f;
    const { groupId: _g, ...rest } = f;
    return rest;
  });
}

/** Put the fixtures with these ids in one new group; groups they leave with a single member dissolve. */
export function groupFixtures(fixtures: Fixture[], ids: Iterable<string>, newGroupId: string): Fixture[] {
  const want = new Set(ids);
  return pruneSingles(fixtures.map((f) => (want.has(f.id) ? { ...f, groupId: newGroupId } : f)));
}

/** Clear groupId from every member of the groups these ids touch. */
export function ungroupFixtures(fixtures: Fixture[], ids: Iterable<string>): Fixture[] {
  const want = new Set(ids);
  const groups = new Set<string>();
  for (const f of fixtures) if (want.has(f.id) && f.groupId) groups.add(f.groupId);
  return fixtures.map((f) => {
    if (!f.groupId || !groups.has(f.groupId)) return f;
    const { groupId: _g, ...rest } = f;
    return rest;
  });
}

export function moveFixtures(fixtures: Fixture[], ids: Iterable<string>, dx: number, dy: number): Fixture[] {
  const want = new Set(ids);
  return fixtures.map((f) => (want.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f));
}

/** Footprint corners (plan px) of a fixture; its centre alone when the catalogue item is unknown. */
function cornersOf(f: Fixture, ppm: number): Pt[] {
  const item = byId(f.type);
  if (!item) return [{ x: f.x, y: f.y }];
  const b = fixtureBox(f, item);
  return rectCorners(f, b.w * ppm, b.d * ppm, f.rot);
}

/** The box around the selected items' footprints, or null when none are selected. */
export function selectionBounds(fixtures: Fixture[], ids: Iterable<string>, ppm: number): Rect | null {
  const want = new Set(ids);
  const pts = fixtures.filter((f) => want.has(f.id)).flatMap((f) => cornersOf(f, ppm));
  if (!pts.length) return null;
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

/** The centre of the box around the fixtures' positions, or null for none. */
export function positionsCentre(fixtures: Fixture[]): Pt | null {
  if (!fixtures.length) return null;
  const xs = fixtures.map((f) => f.x);
  const ys = fixtures.map((f) => f.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * Turn the selected items by deg (clockwise on the plan, y down) about the centre of the box around
 * their positions: positions swing round it and each rot gains deg.
 */
export function rotateFixtures(fixtures: Fixture[], ids: Iterable<string>, deg: number): Fixture[] {
  const want = new Set(ids);
  const c = positionsCentre(fixtures.filter((f) => want.has(f.id)));
  if (!c) return fixtures;
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return fixtures.map((f) => {
    if (!want.has(f.id)) return f;
    const dx = f.x - c.x;
    const dy = f.y - c.y;
    return { ...f, x: round(c.x + dx * cos - dy * sin), y: round(c.y + dx * sin + dy * cos), rot: turn(f.rot, deg) };
  });
}

/** Copies of the selected items shifted by (dx, dy); each old group maps to a fresh one so the copy is its own group. */
export function duplicateFixtures(fixtures: Fixture[], ids: Iterable<string>, dx: number, dy: number, newId: () => string): Fixture[] {
  const want = new Set(ids);
  const groups = new Map<string, string>();
  const out: Fixture[] = [];
  for (const f of fixtures) {
    if (!want.has(f.id)) continue;
    const copy: Fixture = { ...f, id: newId(), x: f.x + dx, y: f.y + dy };
    delete copy.locked; // a copy starts free to move
    if (f.groupId) {
      if (!groups.has(f.groupId)) groups.set(f.groupId, newId());
      copy.groupId = groups.get(f.groupId);
    }
    out.push(copy);
  }
  // A group only partly copied would leave a lone member.
  return pruneSingles(out);
}

/** Ids of the fixtures whose centre lies inside the rectangle. */
export function fixturesInRect(fixtures: Fixture[], rect: Rect): string[] {
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  return fixtures.filter((f) => f.x >= x0 && f.x <= x1 && f.y >= y0 && f.y <= y1).map((f) => f.id);
}

/** The group these ids form exactly (all its members and nothing else), else null. */
export function exactGroup(fixtures: Fixture[], ids: string[]): string | null {
  const g = fixtures.find((f) => f.id === ids[0])?.groupId;
  if (!g) return null;
  const members = fixtures.filter((f) => f.groupId === g);
  return members.length === ids.length && members.every((m) => ids.includes(m.id)) ? g : null;
}
