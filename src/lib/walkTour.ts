import { areaOf, polygonCentroid, type V2 } from "./geometry";
import { ALL_OPEN, cellAt, cellPt, internalOf, levelIndex, nearestCell, passable, roomStand, type WalkInternal } from "./walkNav";
import { liOfNode, search, startNodes } from "./walkRoute";
import { yawOf, type DoorStates, type NavWorld, type TourStop, type WalkPoint, type WalkPose } from "./walkTypes";

/**
 * The guided tour (docs/walkthrough-plan.md, Chunk B): every proper room, nearest by walking first, the
 * storey you are on, then up, then down; the garden last. Routed with every door open (the tour opens them).
 */

/** Rooms smaller than this, metres², are passed by. */
export const TOUR_MIN_AREA = 1.8;
const SKIP = /cupboard|cpd|store|airing/i;

/** The way you were walking on arrival at a node: from about 1 m back along the path. */
function arrivalYaw(I: WalkInternal, parent: Int32Array, id: number): number | null {
  const at = cellPt(I.levels[liOfNode(I, id)].grid, id - I.off[liOfNode(I, id)]);
  let k = id;
  for (let n = 0; n < 10 && parent[k] >= 0 && liOfNode(I, parent[k]) === liOfNode(I, id); n++) k = parent[k];
  const back = cellPt(I.levels[liOfNode(I, k)].grid, k - I.off[liOfNode(I, k)]);
  const d = { x: at.x - back.x, y: at.y - back.y };
  return Math.hypot(d.x, d.y) > 0.3 ? yawOf(d) : null;
}

export function planTour(nav: NavWorld, from: WalkPose, doors: DoorStates): TourStop[] {
  void doors; // The tour opens doors as it reaches them, so it plans with every door open.
  const I = internalOf(nav);
  if (!I || !I.levels.length) return [];
  const here = levelIndex(I, from.level);
  const byLevel = I.levels.map((L, li) => ({ li, level: L.level }));
  const order = [
    here,
    ...byLevel.filter((x) => x.level > I.levels[here].level).sort((a, b) => a.level - b.level).map((x) => x.li),
    ...byLevel.filter((x) => x.level < I.levels[here].level).sort((a, b) => b.level - a.level).map((x) => x.li),
  ];
  const stops: TourStop[] = [];
  let cur: WalkPose | WalkPoint = from;
  for (const li of order) {
    const L = I.levels[li];
    const nl = nav.levels[li];
    let todo = nl.rooms
      .map((r, ri) => ({ r, ri, stand: r.area >= TOUR_MIN_AREA && !SKIP.test(r.name) ? roomStand(I, li, ri) : null }))
      .filter((x) => !!x.stand);
    while (todo.length) {
      const field = search(I, startNodes(I, cur, ALL_OPEN), -1, ALL_OPEN);
      let best = -1;
      let bd = Infinity;
      todo.forEach((t, k) => {
        const c = cellAt(L.grid, t.stand!.at.x, t.stand!.at.y);
        const d = c < 0 ? Infinity : field.g[I.off[li] + c];
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      if (best < 0) break; // The rest cannot be reached.
      const t = todo[best];
      const id = I.off[li] + cellAt(L.grid, t.stand!.at.x, t.stand!.at.y);
      const yaw = arrivalYaw(I, field.parent, id) ?? t.stand!.yaw;
      stops.push({ roomId: t.r.id, name: t.r.name, level: L.level, at: t.stand!.at, yaw });
      cur = { x: t.stand!.at.x, y: t.stand!.at.y, level: L.level, stair: null };
      todo = todo.filter((_, k) => k !== best);
    }
  }
  const garden = gardenStop(I, cur);
  if (garden) stops.push(garden);
  return stops;
}

/** The garden stop: the largest lawn behind the house, else 4 m out from the door into the garden; looking back at the house. */
function gardenStop(I: WalkInternal, cur: WalkPose | WalkPoint): TourStop | null {
  const G = I.garden;
  if (!G?.site) return null;
  const li = I.gardenLi;
  const g = I.levels[li].grid;
  const hc = I.houseCentre;
  let target: V2 | null = null;
  const lawns = G.site.surfaces
    .filter((s) => s.kind === "lawn" && s.polygon.length >= 3 && polygonCentroid(s.polygon).y < hc.y)
    .sort((a, b) => areaOf(b.polygon) - areaOf(a.polygon));
  if (lawns.length) target = polygonCentroid(lawns[0].polygon);
  else {
    const door = I.doors
      .filter((d) => d.li === li && d.nd.passage === "door" && d.out !== 0 && d.nd.kind !== "front")
      .sort((a, b) => a.nd.centre.y - b.nd.centre.y)[0];
    if (door) target = { x: door.nd.centre.x - door.nd.dir.y * door.out * 4, y: door.nd.centre.y + door.nd.dir.x * door.out * 4 };
  }
  if (!target) return null;
  const c = nearestCell(g, target, 1.5, (i) => g.kind[i] === 2 && passable(g, i, ALL_OPEN));
  if (c < 0) return null;
  const field = search(I, startNodes(I, cur, ALL_OPEN), I.off[li] + c, ALL_OPEN);
  if (!field.reached) return null;
  const at = cellPt(g, c);
  return { roomId: null, name: "Garden", level: I.levels[li].level, at, yaw: yawOf({ x: hc.x - at.x, y: hc.y - at.y }) };
}
