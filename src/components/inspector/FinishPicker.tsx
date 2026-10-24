import { useEffect, useRef, useState } from "react";
import { groupOf, type FinishGroup } from "../../lib/finishGroups";

type Thumbs = (kind: "floor" | "wall", finish: string, colour: string | undefined, size?: number) => string;

/** The three.js texture module, loaded on first use so the main bundle stays light. */
let texturesPromise: Promise<Thumbs> | null = null;
const loadThumbs = () => (texturesPromise ??= import("../../three/textures").then((m) => m.finishThumbnail));

/** One tile: draws its thumbnail when it scrolls into view. */
function Tile({
  kind,
  id,
  name,
  title,
  colour,
  selected,
  onPick,
  fallback,
}: {
  kind: "floor" | "wall";
  id: string;
  name: string;
  title: string;
  colour: string | undefined;
  selected: boolean;
  onPick: () => void;
  fallback: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen) return;
    let live = true;
    loadThumbs()
      .then((thumb) => {
        if (live) setUrl(thumb(kind, id, colour, 56));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [seen, kind, id, colour]);
  return (
    <button ref={ref} type="button" className={`finish-tile${selected ? " selected" : ""}`} aria-pressed={selected} title={title} onClick={onPick}>
      <span className="finish-thumb" style={{ background: url ? `center / cover url(${url})` : fallback }} />
      <span className="finish-name">{name}</span>
    </button>
  );
}

/**
 * A grid of finish tiles, 56 px thumbnails drawn from the same procedural
 * textures as the 3D view with a short name under each. Finishes are grouped
 * under small tabs (Wood, Tile, ...), opening on the selected finish's group.
 */
export function FinishPicker<T extends string>({
  kind,
  label,
  value,
  groups,
  names,
  titles,
  selectedColour,
  fallbackColour,
  onPick,
}: {
  kind: "floor" | "wall";
  label: string;
  value: T;
  groups: readonly FinishGroup<T>[];
  /** Short name under each tile. */
  names: Record<T, string>;
  /** Full name, as the tile's tooltip. */
  titles: Record<T, string>;
  /** The colour the selected finish is drawn in (the room's own), if it has one. */
  selectedColour?: string;
  /** Flat colour shown while a thumbnail is still being drawn. */
  fallbackColour?: string;
  onPick: (id: T) => void;
}) {
  const [groupId, setGroupId] = useState(() => groupOf(groups, value).id);
  // A change from outside (undo, another control) brings its group forward.
  useEffect(() => {
    setGroupId(groupOf(groups, value).id);
  }, [groups, value]);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  return (
    <div className="finish-picker" role="group" aria-label={label}>
      <div className="seg small finish-tabs" role="tablist" aria-label={`${label} types`}>
        {groups.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={g.id === group.id} className={g.id === group.id ? "active" : ""} onClick={() => setGroupId(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="finish-grid">
        {group.items.map((id) => (
          <Tile
            key={id}
            kind={kind}
            id={id}
            name={names[id]}
            title={titles[id]}
            colour={id === value ? selectedColour : undefined}
            selected={id === value}
            fallback={fallbackColour ?? "var(--surface-3)"}
            onPick={() => onPick(id)}
          />
        ))}
      </div>
    </div>
  );
}
