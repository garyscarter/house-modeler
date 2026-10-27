import { InspectorCard } from "../../../components/InspectorCard";
import { Info } from "../../../components/Info";
import { defaultFit } from "../../../lib/recess";
import { removeCanopy, resizeCanopy } from "../../../lib/canopy";
import { exactGroup, expandToGroups, rotateFixtures, ungroupFixtures } from "../../../lib/fixtureGroups";
import { DOUBLE_DOOR_M, outsideSide } from "../../../lib/planMath";
import { byId } from "../../../lib/catalogue";
import type { Fixture, Floor, Room, VariantKey } from "../../../types";
import { editsFixtures, type Mode } from "../../../lib/modes";
import { ElectricsPanel } from "../../../components/ElectricsPanel";
import { useStore } from "../../../store";
import { DecoratePanel } from "../../DecoratePanel";
import { BuildRoomPanel, CanopyInspector, FixtureInspector, MultiFixtureInspector, OpeningInspector, WallInspector } from "../../Inspectors";
import { BuildSummary, DecorateSummary, FurnishSummary } from "../../ModeSummaries";
import type { PlanSelection } from "../useSelection";

/** The side card: what to show for the selection in the current mode. */
export function PlanInspector({
  variant,
  floor,
  mode,
  sel,
  selectedRoom,
  clashes,
  misfits,
  clipboardCount,
  onRefit,
  onAdd,
}: {
  variant: VariantKey;
  floor: Floor;
  mode: Mode;
  sel: PlanSelection;
  selectedRoom: Room | undefined;
  clashes: ReadonlySet<string>;
  misfits: ReadonlyMap<string, string>;
  clipboardCount: number;
  onRefit: (fx: Fixture) => void;
  onAdd: () => void;
}) {
  const updateRoom = useStore((s) => s.updateRoom);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const ceilingHeight = useStore((s) => s.variants[variant]?.ceilingHeight);
  const { allFixtures, liveIds, selectedFixtureId, selectedOpeningId, selectedWallId, selectedCanopy, canopies, select, removeSelected, setFixtures, setCanopies, setLitEdge } = sel;
  const { patchFixture, patchOpening, patchWall, duplicateFixtureIds, copyFixtureIds, pasteFixtures, groupSelected, anyLocked, lockFixtures } = sel;
  const ppm = floor.pxPerM;
  const selected = selectedRoom;
  const selectedCanopyPoly = selectedCanopy !== null ? canopies[selectedCanopy] : undefined;
  const selectedOpening = floor.openings.find((o) => o.id === selectedOpeningId);
  const selectedWall = (floor.walls ?? []).find((w) => w.id === selectedWallId);
  const selectedFixture = (floor.fixtures ?? []).find((x) => x.id === selectedFixtureId);
  const selectedFixtureItem = selectedFixture ? byId(selectedFixture.type) : undefined;
  const paste = clipboardCount ? pasteFixtures : undefined;
  return (
    <InspectorCard className="side">
      {editsFixtures(mode) ? (
        liveIds.length >= 2 ? (
          <MultiFixtureInspector
            variant={variant}
            fixtures={allFixtures.filter((x) => liveIds.includes(x.id))}
            isGroup={exactGroup(allFixtures, liveIds) !== null}
            onPick={(id) => select({ fixtures: [id] })}
            onGroup={() => groupSelected(liveIds)}
            onUngroup={() => setFixtures((all) => ungroupFixtures(all, liveIds))}
            onTurn={() => anyLocked(liveIds) || setFixtures((all) => rotateFixtures(all, liveIds, 90))}
            onLock={(on) => lockFixtures(liveIds, on)}
            onDuplicate={() => duplicateFixtureIds(liveIds)}
            onCopy={() => copyFixtureIds(liveIds)}
            onRemove={removeSelected}
            onColour={(color) => setFixtures((all) => all.map((x) => (liveIds.includes(x.id) ? { ...x, color } : x)))}
          />
        ) : selectedFixture && selectedFixtureItem ? (
          <FixtureInspector
            variant={variant}
            fixture={selectedFixture}
            item={selectedFixtureItem}
            ceiling={ceilingHeight}
            clash={clashes.has(selectedFixture.id)}
            misfit={misfits.get(selectedFixture.id)}
            onRefit={defaultFit(selectedFixtureItem) && !selectedFixture.locked ? () => onRefit(selectedFixture) : undefined}
            groupSize={selectedFixture.groupId ? allFixtures.filter((x) => x.groupId === selectedFixture.groupId).length : undefined}
            onSelectGroup={() => select({ fixtures: expandToGroups([selectedFixture.id], allFixtures) })}
            onChange={(p) => patchFixture(selectedFixture.id, p)}
            onDuplicate={() => duplicateFixtureIds([selectedFixture.id])}
            onCopy={() => copyFixtureIds([selectedFixture.id])}
            onPaste={paste}
            onRemove={removeSelected}
          />
        ) : mode === "electrics" ? (
          <ElectricsPanel variant={variant} floor={floor} onAdd={onAdd} />
        ) : (
          <FurnishSummary floor={floor} clashes={clashes.size} onAdd={onAdd} onPaste={paste} />
        )
      ) : mode === "decorate" ? (
        selected ? (
          <DecoratePanel key={selected.id} variant={variant} floor={floor} room={selected} edge={selectedEdge} onChange={(p) => updateRoom(variant, floor.id, selected.id, p)} onHighlightEdge={setLitEdge} />
        ) : selectedWall ? (
          <WallInspector mode="decorate" wall={selectedWall} onChange={(p) => patchWall(selectedWall.id, p)} onDelete={removeSelected} />
        ) : (
          <DecorateSummary floor={floor} />
        )
      ) : selected ? (
        <BuildRoomPanel key={selected.id} variant={variant} floor={floor} room={selected} onChange={(p) => updateRoom(variant, floor.id, selected.id, p)} onHighlightEdge={setLitEdge} />
      ) : selectedCanopyPoly ? (
        <CanopyInspector
          key={selectedCanopy}
          poly={selectedCanopyPoly}
          ppm={ppm}
          onResize={(w, h, fixed) => setCanopies((all) => resizeCanopy(all, selectedCanopy!, w, h, fixed))}
          onDelete={() => {
            setCanopies((all) => removeCanopy(all, selectedCanopy!));
            sel.setSelectedCanopy(null);
          }}
        />
      ) : selectedOpening ? (
        <OpeningInspector
          opening={selectedOpening}
          pair={selectedOpening.kind === "door" && selectedOpening.widthM > DOUBLE_DOOR_M && outsideSide(selectedOpening, floor.rooms, 0.3 * ppm) === 0}
          floor={floor}
          onChange={(p) => patchOpening(selectedOpening.id, p)}
          onDelete={removeSelected}
        />
      ) : selectedWall ? (
        <WallInspector mode="build" wall={selectedWall} onChange={(p) => patchWall(selectedWall.id, p)} onDelete={removeSelected} />
      ) : (
        <>
          <BuildSummary variant={variant} floor={floor} />
          <p className="hint-row muted small">
            Nothing selected
            <Info>Select a room to check its size and finishes, a porch canopy, an opening to change its type and size, or a wall.</Info>
          </p>
        </>
      )}
    </InspectorCard>
  );
}
