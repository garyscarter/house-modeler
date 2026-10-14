import type { Floor, Photo, Pt } from "../types";

/** Pure model operations used by the store (kept here so they can be unit tested). */

/** Keep photo assignments pointing at a room or floor after it is renamed. */
export function renamePhotos(photos: Photo[], floorName: string, from: { room?: string; floor?: string }, to: { room?: string; floor?: string }): Photo[] {
  let changed = false;
  const out = photos.map((p) => {
    if (p.floorName !== floorName) return p;
    if (from.floor !== undefined && to.floor !== undefined) {
      changed = true;
      return { ...p, floorName: to.floor };
    }
    if (from.room !== undefined && p.roomName === from.room) {
      changed = true;
      return { ...p, roomName: to.room };
    }
    return p;
  });
  return changed ? out : photos;
}

/** Scale every image-pixel coordinate on a floor by `s`. */
export function scaleFloor(f: Floor, s: number, image: string, w: number, h: number): Floor {
  const sc = (p: Pt) => ({ x: p.x * s, y: p.y * s });
  return {
    ...f,
    image,
    imageW: w,
    imageH: h,
    pxPerM: f.pxPerM * s,
    origin: sc(f.origin),
    rooms: f.rooms.map((r) => ({ ...r, polygon: r.polygon.map(sc) })),
    openings: f.openings.map((o) => ({ ...o, ...sc(o) })),
    walls: f.walls?.map((wl) => ({ ...wl, a: sc(wl.a), b: sc(wl.b) })),
    fixtures: f.fixtures?.map((fx) => ({ ...fx, ...sc(fx) })),
    canopies: f.canopies?.map((poly) => poly.map(sc)),
    stairs: f.stairs ? sc(f.stairs) : undefined,
  };
}

