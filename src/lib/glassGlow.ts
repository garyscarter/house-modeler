/** Window glass glow without rebuilding the shell: each pane face stores a fixed room slot, the lit set is a bitmask. */

/** Rooms per floor whose panes can glow: four uint32 words in the glass shader. */
export const MAX_GLASS_ROOMS = 128;

/** Room id to 1-based slot by `floor.rooms` order (0 is "never glows"); rooms past 128 get no slot. */
export function roomSlots(roomIds: readonly string[]): Map<string, number> {
  const slots = new Map<string, number>();
  for (let i = 0; i < roomIds.length && i < MAX_GLASS_ROOMS; i++) slots.set(roomIds[i], i + 1);
  return slots;
}

/** Four uint32 words with bit (s-1) set for each lit room's slot s. Writes into `out` when given. */
export function litMask(slots: ReadonlyMap<string, number>, lit: ReadonlySet<string>, out: Uint32Array = new Uint32Array(4)): Uint32Array {
  out.fill(0);
  for (const id of lit) {
    const s = slots.get(id);
    if (!s) continue;
    const b = s - 1;
    out[b >>> 5] = (out[b >>> 5] | (1 << (b & 31))) >>> 0;
  }
  return out;
}
