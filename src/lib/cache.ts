/**
 * Keys to drop from a cache kept in use order (oldest first) so it holds at
 * most `max` entries, of which at most `heavyMax` are heavy ones (entries
 * owning a large texture). Oldest go first.
 */
export function overflow(keys: string[], max: number, isHeavy: (key: string) => boolean, heavyMax: number): string[] {
  const out = new Set<string>();
  const heavy = keys.filter(isHeavy);
  for (let i = 0; i < heavy.length - heavyMax; i++) out.add(heavy[i]);
  for (const k of keys) {
    if (keys.length - out.size <= max) break;
    out.add(k);
  }
  return [...out];
}
