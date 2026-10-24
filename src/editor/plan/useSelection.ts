import { useEffect, useMemo, useState } from "react";
import { byId } from "../../lib/catalogue";
import { removeCanopy } from "../../lib/canopy";
import { getClipboardFixtures, setClipboardFixtures } from "../../lib/clipboard";
import { duplicateFixtures, expandToGroups, groupFixtures, positionsCentre } from "../../lib/fixtureGroups";
import { pasteAt } from "../../lib/nudge";
import { useStore } from "../../store";
import { uid, type Fixture, type Floor, type Opening, type Pt, type VariantKey, type Wall } from "../../types";

export type Selection = { room?: string; opening?: string; wall?: string; fixtures?: string[]; canopy?: number };

/** The "Right-click a room for more" hint is shown once per session, on the first room selection. */
let roomHintShown = false;

/**
 * What is selected on the plan (room, opening, wall, furniture, canopy, the corner the arrows move), the floor edits
 * a selection can make, and the furniture commands (copy, paste, duplicate, group, lock) that act on it.
 * `viewCentre` is where a keyboard paste lands: the middle of what the camera shows.
 */
export function usePlanSelection(variant: VariantKey, floor: Floor, viewCentre: () => Pt) {
  const updateFloor = useStore((s) => s.updateFloor);
  const setUi = useStore((s) => s.setUi);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const [edgeEdit, setEdgeEdit] = useState<{ roomId: string; idx: number } | null>(null);
  /** The selected room's wall lit from its row in the inspector. */
  const [litEdge, setLitEdge] = useState<number | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  /** Selected furniture; always whole groups unless an item was picked alone (Ctrl/Cmd+click). */
  const [selectedFixtureIds, setSelectedFixtureIds] = useState<string[]>([]);
  /** The group under the pointer in Furnish, outlined faintly so groups can be found. */
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  /** Canopies have no ids, so the selected one is its index in floor.canopies. */
  const [selectedCanopy, setSelectedCanopy] = useState<number | null>(null);
  /** The room corner last clicked or dragged: the one the arrow keys move. */
  const [activeCorner, setActiveCorner] = useState<{ roomId: string; idx: number } | null>(null);
  const [roomHint, setRoomHint] = useState(false);
  const ppm = floor.pxPerM;

  // The first room selected in a session earns a one-off pointer to the context menu.
  useEffect(() => {
    if (!selectedRoomId || roomHintShown) return;
    roomHintShown = true;
    setRoomHint(true);
    const t = window.setTimeout(() => setRoomHint(false), 5000);
    return () => window.clearTimeout(t);
  }, [selectedRoomId]);

  // A room picked from elsewhere (the 3D view) takes over from the canopy.
  useEffect(() => {
    if (selectedRoomId) setSelectedCanopy(null);
  }, [selectedRoomId]);

  const select = (s: Selection) => {
    setSelectedOpeningId(s.opening ?? null);
    setSelectedWallId(s.wall ?? null);
    setSelectedFixtureIds(s.fixtures ?? []);
    setSelectedCanopy(s.canopy ?? null);
    setLitEdge(null);
    setUi({ selectedRoomId: s.room ?? null, selectedEdge: null });
    setEdgeEdit(null);
    setActiveCorner(null);
  };

  // ---- Floor edits
  const setFixtures = (fn: (fx: Fixture[]) => Fixture[]) => updateFloor(variant, floor.id, (f) => ({ ...f, fixtures: fn(f.fixtures ?? []) }));
  const patchFixture = (id: string, p: Partial<Fixture>) => setFixtures((all) => all.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const patchOpening = (id: string, p: Partial<Opening>) => updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.map((o) => (o.id === id ? { ...o, ...p } : o)) }));
  const dropOpening = (id: string) => updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.filter((o) => o.id !== id) }));
  const patchWall = (id: string, p: Partial<Wall>) => updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).map((w) => (w.id === id ? { ...w, ...p } : w)) }));
  const dropWall = (id: string) => updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).filter((w) => w.id !== id) }));
  const allFixtures = floor.fixtures ?? [];
  const canopies = floor.canopies ?? [];
  const setCanopies = (fn: (c: Pt[][]) => Pt[][]) => updateFloor(variant, floor.id, (f) => ({ ...f, canopies: fn(f.canopies ?? []) }));
  // A canopy is selected by index, so undoing it away leaves a stale selection.
  useEffect(() => {
    if (selectedCanopy !== null && !canopies[selectedCanopy]) setSelectedCanopy(null);
  }, [canopies]);

  /** The selection without ids that no longer exist (deleted, or undone away). */
  const liveIds = useMemo(() => selectedFixtureIds.filter((id) => allFixtures.some((x) => x.id === id)), [selectedFixtureIds, allFixtures]);
  const selectedFixtureId = liveIds.length === 1 ? liveIds[0] : null;
  /** What a command aimed at one fixture acts on: the selection when it is in it, else its whole group. */
  const targetIds = (id: string) => (liveIds.includes(id) ? liveIds : expandToGroups([id], allFixtures));

  const removeSelected = () => {
    if (selectedCanopy !== null) {
      if (canopies[selectedCanopy]) setCanopies((all) => removeCanopy(all, selectedCanopy));
      setSelectedCanopy(null);
    } else if (liveIds.length) {
      setFixtures((all) => all.filter((x) => !liveIds.includes(x.id)));
      setSelectedFixtureIds([]);
    } else if (selectedOpeningId) {
      if (floor.openings.some((o) => o.id === selectedOpeningId)) dropOpening(selectedOpeningId);
      setSelectedOpeningId(null);
    } else if (selectedWallId) {
      if ((floor.walls ?? []).some((w) => w.id === selectedWallId)) dropWall(selectedWallId);
      setSelectedWallId(null);
    }
  };

  // ---- Furniture commands
  /** Whether any of these fixtures is locked against moving. */
  const anyLocked = (ids: string[]) => allFixtures.some((f) => f.locked && ids.includes(f.id));
  /** Lock or unlock these fixtures. */
  const lockFixtures = (ids: string[], on: boolean) => setFixtures((all) => all.map((f) => (ids.includes(f.id) ? { ...f, locked: on || undefined } : f)));
  const duplicateFixtureIds = (ids: string[]) => {
    const copies = duplicateFixtures(allFixtures, ids, 0.2 * ppm, 0.2 * ppm, uid);
    if (!copies.length) return;
    setFixtures((all) => [...all, ...copies]);
    select({ fixtures: copies.map((c) => c.id) });
  };
  const copyFixtureIds = (ids: string[]) => {
    const src = allFixtures.filter((x) => ids.includes(x.id));
    if (src.length) setClipboardFixtures(src);
  };
  /** Paste the clipboard onto this floor (any layout or floor), keeping its layout and selecting the copies. */
  const pasteFixtures = (where?: Pt) => {
    const src = getClipboardFixtures().filter((f) => byId(f.type));
    if (!src.length) return;
    let dx = 0;
    let dy = 0;
    if (where) {
      const c = positionsCentre(src)!;
      dx = where.x - c.x;
      dy = where.y - c.y;
    } else {
      const at = pasteAt(src[0], allFixtures, { w: floor.imageW, h: floor.imageH }, viewCentre(), ppm);
      dx = at.x - src[0].x;
      dy = at.y - src[0].y;
    }
    const copies = duplicateFixtures(src, src.map((f) => f.id), dx, dy, uid);
    setFixtures((all) => [...all, ...copies]);
    select({ fixtures: copies.map((c) => c.id) });
  };
  const groupSelected = (ids: string[]) => {
    if (ids.length < 2) return;
    setFixtures((all) => groupFixtures(all, ids, uid()));
  };

  return {
    // state
    edgeEdit, setEdgeEdit, litEdge, setLitEdge,
    selectedOpeningId, selectedWallId, selectedFixtureIds, hoverGroup, setHoverGroup, selectedCanopy, setSelectedCanopy,
    activeCorner, setActiveCorner, roomHint,
    // derived
    allFixtures, canopies, liveIds, selectedFixtureId, targetIds, anyLocked,
    // commands
    select, removeSelected, lockFixtures, duplicateFixtureIds, copyFixtureIds, pasteFixtures, groupSelected,
    // floor edits
    setFixtures, patchFixture, patchOpening, dropOpening, patchWall, dropWall, setCanopies,
  };
}
export type PlanSelection = ReturnType<typeof usePlanSelection>;
