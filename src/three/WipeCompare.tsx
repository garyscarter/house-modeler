import type { Floor, Photo, Room, VariantKey } from "../types";
import { useStore } from "../store";
import { Viewer } from "./Viewer";

export interface WipeCompareProps {
  photos: Photo[];
  showLabels: boolean;
  showCeilings: boolean;
  doorsOpen: boolean;
  selectedRoomId: string | null;
  onSelectRoom: (floor: Floor, room: Room, variant: VariantKey) => void;
  maxLevel: number | null;
  showExterior: boolean;
}

/** STUB (Chunk 0): shows Proposed alone. The wipe (two stacked canvases, linked cameras) replaces this body. */
export function WipeCompare(p: WipeCompareProps) {
  const variants = useStore((s) => s.variants);
  const model = variants.proposed ?? variants.current;
  const variant: VariantKey = variants.proposed ? "proposed" : "current";
  return (
    <div className="wipe" style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
      {model && (
        <Viewer
          model={model}
          variant={variant}
          photos={p.photos}
          showLabels={p.showLabels}
          showCeilings={p.showCeilings}
          doorsOpen={p.doorsOpen}
          selectedRoomId={p.selectedRoomId}
          onSelectRoom={(f, r) => p.onSelectRoom(f, r, variant)}
          maxLevel={p.maxLevel}
          showExterior={p.showExterior}
        />
      )}
    </div>
  );
}
