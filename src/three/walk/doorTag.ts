import type { Object3D } from "three";
/** userData key on a door's leaf group: which door it is and how it started, so a tap on it can open or shut it. */
export const DOOR_TAG = "walkDoor";
export interface DoorTag { key: string; initial: boolean }
export function doorTagOf(o: Object3D | null): DoorTag | null {
  for (; o; o = o.parent) {
    const t = o.userData?.[DOOR_TAG] as DoorTag | undefined;
    if (t) return t;
  }
  return null;
}
