import type { Floor, Opening } from "../types";
import { roomAt } from "./layoutMerge";

/**
 * Names of the two sides of an opening, for labelling per-side colours.
 *
 * Wall directions are canonical (dir.x > 0, or dir.x = 0 and dir.y > 0; see
 * cutWall in geometry.ts) and local +z is the wall direction turned
 * anticlockwise, n = (-dir.y, dir.x). So on an "h" wall +z is plan +y (down
 * the page) and on a "v" wall it is plan -x (left). The front side is the
 * outside when exactly one side has no room, and the +z side otherwise.
 * A side with no room is "outside"; if both names come out the same they
 * become "one side" and "other side".
 */
export function openingSides(floor: Floor, op: Pick<Opening, "x" | "y" | "orientation">): { front: string; back: string } {
  const probe = 0.3 * floor.pxPerM;
  const n = op.orientation === "h" ? { x: 0, y: probe } : { x: -probe, y: 0 };
  const name = (s: 1 | -1) => roomAt(floor, { x: op.x + n.x * s, y: op.y + n.y * s })?.name ?? "outside";
  const plus = name(1);
  const minus = name(-1);
  if (plus === minus) return { front: "one side", back: "other side" };
  if (minus === "outside") return { front: minus, back: plus };
  return { front: plus, back: minus };
}
