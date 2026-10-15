import type { Photo } from "../types";

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
