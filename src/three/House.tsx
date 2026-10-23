import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Billboard, Html, Image as DreiImage } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Elevation, Floor, HouseModel, Photo, Room } from "../types";
import { exteriorOf } from "../lib/roof";
import { roomColor } from "../lib/roomColor";
import { wallThickness } from "../lib/walls";
import { ceilingY } from "../lib/ceiling";
import { Roof } from "./Roof";
import { Fixtures } from "./Fixtures";
import { RoomLabels } from "./RoomLabels";
import { Balustrade } from "./Balustrade";
import { balustrades, cutWells, stairwells, type RailRun, type Rect, type Stairwell } from "../lib/stairwell";
import { boxedPart, floorFlight, SOFFIT, stairTreads, treadCount } from "../lib/stairs";
import { GROUND_Y } from "./Site";
import { buildShell } from "./shell";
import { getMaterial, type MatSpec } from "./textures";
import { finishColour, floorAngle, groutColour } from "../lib/floorFinish";
import { floorUv } from "../lib/floorPattern";
import {
  type WallSeg,
  WALL_T,
  buildWalls,
  diffWalls,
  modelBounds,
  polygonCentroid,
  roomWorldPolygon,
  type V2,
  type WallPiece,
} from "../lib/geometry";

export { WALL_T, roomColor };

export function floorBaseY(model: HouseModel, floor: Floor) {
  return floor.level * (model.ceilingHeight + model.slabThickness);
}

interface HouseProps {
  model: HouseModel;
  photos: Photo[];
  ghost?: boolean;
  showLabels?: boolean;
  showCeilings?: boolean;
  /** Swing doors drawn at their open angle (default shut). */
  doorsOpen?: boolean;
  selectedRoomId?: string | null;
  onSelectRoom?: (floor: Floor, room: Room) => void;
  /** Decorate: a tap on a wall face (hit point and face normal in the plan frame: world x, z). */
  onPickWall?: (floor: Floor, hit: V2, normal: V2, bays?: { id: string; poly: V2[] }[]) => void;
  /** Only render these floor levels (used to hide floors above the walk floor). */
  visibleLevels?: number[] | null;
  /**
   * Another variant to compare against. In ghost mode only walls missing from
   * it are drawn (what the renovation removes); in solid mode walls missing
   * from it are highlighted green (what the renovation adds).
   */
  diffAgainst?: HouseModel;
  /** Draw roofs, canopies and exterior photo pins. */
  showExterior?: boolean;
}

/** Decorate: furniture, ceilings and the roof swallow clicks so a tap never reaches the wall or floor behind them. */
const block = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function House({
  model,
  photos,
  ghost,
  showLabels = true,
  showCeilings = false,
  doorsOpen = false,
  selectedRoomId,
  onSelectRoom,
  onPickWall,
  visibleLevels,
  diffAgainst,
  showExterior,
}: HouseProps) {
  const ext = exteriorOf(model);
  const floors = model.floors.filter((f) => !visibleLevels || visibleLevels.includes(f.level));
  // Labels go on the topmost visible floor only: lower floors' labels would
  // be read through the floors and walls above them (see RoomLabels).
  const labelLevel = floors.length ? Math.max(...floors.map((f) => f.level)) : null;
  const wells = useMemo(() => stairwells(model), [model]);
  return (
    <group>
      {showExterior && !ghost && ext.showRoof && (onPickWall ? <group onClick={block}><Roof model={model} /></group> : <Roof model={model} />)}
      {showExterior && !ghost && <ExteriorPins model={model} photos={photos} />}
      {floors.map((floor) => (
        <FloorGroup
          key={floor.id}
          model={model}
          floor={floor}
          photos={photos}
          ghost={!!ghost}
          showLabels={showLabels && floor.level === labelLevel}
          roofOver={!!showExterior && !ghost && ext.showRoof}
          showCeilings={showCeilings}
          doorsOpen={doorsOpen}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
          onPickWall={onPickWall}
          otherFloor={diffAgainst?.floors.find((f) => f.level === floor.level) ?? null}
          wells={wells}
        />
      ))}
    </group>
  );
}

function FloorGroup({
  model,
  floor,
  photos,
  ghost,
  showLabels,
  roofOver,
  showCeilings,
  doorsOpen,
  selectedRoomId,
  onSelectRoom,
  onPickWall,
  otherFloor,
  wells,
}: {
  model: HouseModel;
  floor: Floor;
  photos: Photo[];
  ghost: boolean;
  showLabels: boolean;
  /** The roof is drawn over this floor, so only the selected room is labelled. */
  roofOver: boolean;
  showCeilings: boolean;
  doorsOpen: boolean;
  selectedRoomId?: string | null;
  onSelectRoom?: (floor: Floor, room: Room) => void;
  onPickWall?: (floor: Floor, hit: V2, normal: V2, bays?: { id: string; poly: V2[] }[]) => void;
  otherFloor?: Floor | null;
  wells: Stairwell[];
}) {
  const y0 = floorBaseY(model, floor);
  // Openings in this floor (stairwells from below) and in the ceiling over it (stairwells up from here).
  const holes = useMemo(() => wells.filter((w) => w.upperId === floor.id).flatMap((w) => w.rects), [wells, floor.id]);
  const ceilingHoles = useMemo(() => wells.filter((w) => w.lowerId === floor.id).flatMap((w) => w.rects), [wells, floor.id]);
  const rails = useMemo(() => {
    const out: RailRun[] = [];
    for (const w of wells) {
      if (w.lowerId !== floor.id && w.upperId !== floor.id) continue;
      const b = balustrades(model, w);
      out.push(...(w.lowerId === floor.id ? b.lower : b.upper));
    }
    return out;
  }, [wells, model, floor.id]);
  const H = model.ceilingHeight;
  const hasAbove = model.floors.some((f) => f.level === floor.level + 1);
  const allWalls = useMemo(() => buildWalls(floor), [floor]);
  const otherWalls = useMemo(() => (otherFloor ? buildWalls(otherFloor) : null), [otherFloor]);
  // Walls of this floor that the other variant does not have.
  const changed = useMemo(() => (otherWalls ? diffWalls(allWalls, otherWalls) : []), [allWalls, otherWalls]);

  // Ghost mode with a comparison draws only the removed walls.
  if (ghost)
    return (
      <group position={[0, y0, 0]}>
        {(otherWalls ? changed : allWalls).map((w, i) => (
          <WallBox key={i} piece={{ a: w.a, b: w.b, y0: 0, y1: w.height ?? H }} thickness={wallThickness(w)}>
            <meshStandardMaterial color="#e0332f" transparent opacity={0.28} depthWrite={false} />
          </WallBox>
        ))}
      </group>
    );

  return (
    <group position={[0, y0, 0]}>
      <FloorShell model={model} floor={floor} walls={allWalls} photos={photos} selectedRoomId={selectedRoomId} onSelectRoom={onSelectRoom} onPickWall={onPickWall} holes={holes} doorsOpen={doorsOpen} />
      {showCeilings && (
        <group onClick={onPickWall ? block : undefined}>
          {floor.rooms.map((room) => <RoomCeiling key={room.id} floor={floor} room={room} height={H} holes={ceilingHoles} />)}
        </group>
      )}
      <Balustrade runs={rails} />

      {otherWalls &&
        changed.map((w, i) => (
          <WallBox key={"new" + i} piece={{ a: w.a, b: w.b, y0: 0, y1: H }} thickness={wallThickness(w) + 0.04}>
            <meshStandardMaterial color="#16a34a" transparent opacity={0.55} depthWrite={false} />
          </WallBox>
        ))}

      {floor.stairs && hasAbove && <Stairs model={model} floor={floor} />}

      <group onClick={onPickWall ? block : undefined}>
        <Fixtures floor={floor} />
      </group>

      {showLabels && <RoomLabels floor={floor} baseY={y0} ceiling={H} roofOver={roofOver} selectedRoomId={selectedRoomId ?? null} />}

      {floor.rooms.map((room) => (
        <PhotoPin key={room.id} floor={floor} room={room} photos={photos} />
      ))}
    </group>
  );
}

/**
 * Walls, joinery and floors of one floor. Walls and openings are merged into
 * one mesh per material (see shell.ts); floors stay one mesh per room so a
 * click can select the room.
 */
function FloorShell({
  model,
  floor,
  walls,
  photos,
  selectedRoomId,
  onSelectRoom,
  onPickWall,
  holes,
  doorsOpen,
}: {
  model: HouseModel;
  floor: Floor;
  walls: WallSeg[];
  photos: Photo[];
  selectedRoomId?: string | null;
  onSelectRoom?: (floor: Floor, room: Room) => void;
  onPickWall?: (floor: Floor, hit: V2, normal: V2, bays?: { id: string; poly: V2[] }[]) => void;
  /** Stairwell openings to leave out of the floor and slab. */
  holes: Rect[];
  doorsOpen: boolean;
}) {
  const ext = exteriorOf(model);
  const H = model.ceilingHeight;
  const slab = model.slabThickness;
  const lowest = Math.min(...model.floors.map((f) => f.level));
  const baseY = floorBaseY(model, floor);
  const upperPolys = useMemo(
    () => model.floors.filter((f) => f.level === floor.level + 1).flatMap((f) => f.rooms.map((r) => roomWorldPolygon(f, r))),
    [model.floors, floor.level],
  );
  const upperWalls = useMemo(() => model.floors.filter((f) => f.level === floor.level + 1).flatMap((f) => buildWalls(f)), [model.floors, floor.level]);
  // The flight up from this floor: walls it passes over stop under its treads.
  const flight = useMemo(() => (model.floors.some((f) => f.level === floor.level + 1) ? floorFlight(model, floor) : null), [model, floor]);
  const finish = ext.wallFinish ?? "render";
  const shell = useMemo(
    () =>
      buildShell({
        floor,
        walls,
        ceiling: H,
        slab,
        upperPolys,
        upperWalls,
        // The lowest floor's external walls run down to the garden.
        plinthY: floor.level === lowest ? GROUND_Y - baseY - 0.02 : null,
        baseY,
        wallFinish: finish,
        wallColor: ext.wallColor,
        trimColor: ext.trimColor,
        doorsOpen,
        flight,
      }),
    [floor, walls, H, slab, upperPolys, upperWalls, lowest, baseY, finish, ext.wallColor, ext.trimColor, doorsOpen, flight],
  );
  useEffect(() => () => shell.meshes.forEach((m) => m.geometry.dispose()), [shell]);

  const roomsById = useMemo(() => new Map(floor.rooms.map((r) => [r.id, r])), [floor.rooms]);
  // Each room's floor, as pieces when a stairwell opening is cut out of it.
  const polys = useMemo(() => floor.rooms.map((r) => cutWells(roomWorldPolygon(floor, r), holes)), [floor, holes]);

  // One slab under all the rooms so nothing floats.
  const slabGeom = useMemo(() => {
    const parts = polys.flat().map((p) => new THREE.ExtrudeGeometry(shapeFrom(p), { depth: slab, bevelEnabled: false }));
    const merged = parts.length ? mergeGeometries(parts) : null;
    parts.forEach((g) => g.dispose());
    return merged;
  }, [polys, slab]);
  useEffect(() => () => slabGeom?.dispose(), [slabGeom]);

  return (
    <group>
      {slabGeom && <mesh geometry={slabGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, -slab, 0]} material={getMaterial(SLAB)} receiveShadow />}
      {floor.rooms.map((room, i) => (
        <RoomFloor
          key={room.id}
          room={room}
          polys={polys[i]}
          photos={photos}
          selected={room.id === selectedRoomId}
          onSelect={() => onSelectRoom?.(floor, room)}
        />
      ))}
      {shell.bayFloors.map((b, i) => {
        const room = b.roomId ? roomsById.get(b.roomId) : undefined;
        return room ? (
          <RoomFloor
            key={"bay" + i}
            room={room}
            polys={[b.poly]}
            photos={photos}
            selected={room.id === selectedRoomId}
            onSelect={() => onSelectRoom?.(floor, room)}
          />
        ) : null;
      })}
      {shell.meshes.map((m) => (
        <mesh
          key={m.key}
          geometry={m.geometry}
          material={getMaterial(m.spec)}
          castShadow={m.castShadow}
          receiveShadow
          onClick={
            onPickWall &&
            ((e) => {
              // A wall top (or any up/down face) is swallowed rather than falling through to the floor beneath.
              e.stopPropagation();
              if (!e.face || Math.abs(e.face.normal.y) > 0.5) return;
              // Shell meshes are not rotated or moved, so the local normal is the world normal.
              const bays = shell.bayFloors.flatMap((b) => (b.roomId ? [{ id: b.roomId, poly: b.poly }] : []));
              onPickWall(floor, { x: e.point.x, y: e.point.z }, { x: e.face.normal.x, y: e.face.normal.z }, bays);
            })
          }
        />
      ))}
    </group>
  );
}

const SLAB: MatSpec = { kind: "plain", color: "#b8b3a8", roughness: 0.9 };

function shapeFrom(poly: V2[]): THREE.Shape {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i === 0 ? s.moveTo(p.x, -p.y) : s.lineTo(p.x, -p.y)));
  s.closePath();
  return s;
}

/** The floor finish of a room: a textured finish in the room's colour, or the plain room colour. */
function floorSpec(room: Room, selected: boolean): MatSpec {
  const finish = room.floorFinish ?? "plain";
  if (finish === "plain") return { kind: "floor", finish, color: roomColor(room), selected };
  return { kind: "floor", finish, color: finishColour(room)!, selected, grout: room.floorGrout && groutColour(room) };
}

function RoomFloor({ room, polys, photos, selected, onSelect }: { room: Room; polys: V2[][]; photos: Photo[]; selected: boolean; onSelect: () => void }) {
  // Shape coordinates are metres, so the UVs keep boards and tiles at their real size;
  // a floor angle turns them about the plan's origin, so rooms laid the same way line up.
  const angle = floorAngle(room);
  const geom = useMemo(() => {
    const g = new THREE.ShapeGeometry(polys.map(shapeFrom));
    if (angle) {
      const uv = g.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) {
        // Shape y is minus plan y.
        const [u, v] = floorUv(uv.getX(i), -uv.getY(i), angle);
        uv.setXY(i, u, -v);
      }
    }
    return g;
  }, [polys, angle]);
  useEffect(() => () => geom.dispose(), [geom]);
  const photo = room.floorPhotoId ? photos.find((p) => p.id === room.floorPhotoId) : undefined;
  const material = getMaterial(floorSpec(room, selected));
  return (
    <mesh
      geometry={geom}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.012, 0]}
      receiveShadow
      material={photo ? undefined : material}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {photo && (
        <Suspense fallback={<primitive object={material} attach="material" />}>
          <PhotoFloorMaterial url={photo.dataUrl} tint={selected ? "#ffd166" : "#ffffff"} />
        </Suspense>
      )}
    </mesh>
  );
}

function PhotoFloorMaterial({ url, tint }: { url: string; tint: string }) {
  const tex = useLoader(THREE.TextureLoader, url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.5, 0.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return <meshStandardMaterial map={tex} color={tint} roughness={0.8} />;
}

function RoomCeiling({ floor, room, height, holes }: { floor: Floor; room: Room; height: number; holes: Rect[] }) {
  const polys = useMemo(() => cutWells(roomWorldPolygon(floor, room), holes), [floor, room, holes]);
  const geom = useMemo(() => new THREE.ShapeGeometry(polys.map(shapeFrom)), [polys]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, ceilingY(height), 0]}>
      <meshStandardMaterial color="#f3f3f0" emissive="#ffffff" emissiveIntensity={0.35} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** A plain box along a wall line, used for the compare overlays. */
function WallBox({ piece, children, thickness }: { piece: WallPiece; children: React.ReactNode; thickness: number }) {
  const dx = piece.b.x - piece.a.x;
  const dz = piece.b.y - piece.a.y;
  const len = Math.hypot(dx, dz);
  const h = piece.y1 - piece.y0;
  if (len < 0.01 || h < 0.01) return null;
  return (
    <mesh position={[(piece.a.x + piece.b.x) / 2, piece.y0 + h / 2, (piece.a.y + piece.b.y) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <boxGeometry args={[len, h, thickness]} />
      {children}
    </mesh>
  );
}

/**
 * The flight from this floor to the one above: each tread a solid block down
 * to the floor (the understairs is boxed in), carpeted across its top riser,
 * with kite winders at the foot or head when the flight turns there. Where
 * the flight passes over a wall into another room (a head running on over
 * the kitchen), only a soffit hangs under the treads there.
 */
function Stairs({ model, floor }: { model: HouseModel; floor: Floor }) {
  const geom = useMemo(() => {
    const f = floorFlight(model, floor);
    if (!f) return null;
    const treads = stairTreads(f);
    const riser = f.rise / treadCount(f);
    const boxed = boxedPart(floor, f);
    const body: THREE.BufferGeometry[] = [];
    const carpet: THREE.BufferGeometry[] = [];
    // Shapes are drawn on the plan (x, -y) and extruded up, then stood upright.
    const block = (pts: V2[], y0: number, y1: number) => new THREE.ExtrudeGeometry(shapeFrom(pts), { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
    for (const t of treads) {
      // Down to the floor over the stairs hall; a soffit where the flight has passed over a wall into another room.
      const under = t.top - riser;
      const box = boxed(t.pts);
      if (box && under > 0.001) body.push(block(box, 0, under));
      if (box !== t.pts && under > 0.001) body.push(block(t.pts, Math.max(0, under - SOFFIT), under));
      carpet.push(block(t.pts, Math.max(0, t.top - riser), t.top));
    }
    const merge = (parts: THREE.BufferGeometry[]) => {
      const g = parts.length ? mergeGeometries(parts) : null;
      parts.forEach((p) => p.dispose());
      return g;
    };
    return { body: merge(body), carpet: merge(carpet) };
  }, [model, floor]);
  useEffect(() => () => {
    geom?.body?.dispose();
    geom?.carpet?.dispose();
  }, [geom]);
  if (!geom) return null;
  return (
    <group>
      {geom.body && <mesh geometry={geom.body} material={getMaterial(UNDERSTAIRS)} castShadow receiveShadow />}
      {geom.carpet && <mesh geometry={geom.carpet} material={getMaterial(STAIR_CARPET)} castShadow receiveShadow />}
    </group>
  );
}

/** Painted understairs panelling and beige stair carpet, as in the listing photos. */
const UNDERSTAIRS: MatSpec = { kind: "paint", color: "#f1eee8" };
const STAIR_CARPET: MatSpec = { kind: "plain", color: "#c7b9a5", roughness: 1 };

function PhotoPin({ floor, room, photos }: { floor: Floor; room: Room; photos: Photo[] }) {
  const mine = photos.filter((p) => p.floorName === floor.name && p.roomName === room.name);
  const c = useMemo(() => polygonCentroid(roomWorldPolygon(floor, room)), [floor, room]);
  const setUi = useUiSetter();
  if (!mine.length) return null;
  const first = mine[0];
  return (
    <Billboard position={[c.x, 1.55, c.y]}>
      <Suspense fallback={null}>
        <DreiImage
          url={first.dataUrl}
          scale={[1.1, 0.8]}
          transparent
          onClick={(e) => {
            e.stopPropagation();
            setUi({ selectedRoomId: room.id, selectedPhotoId: first.id });
          }}
        />
      </Suspense>
      {mine.length > 1 && (
        <Html position={[0.5, 0.35, 0]} center style={{ pointerEvents: "none" }}>
          <div className="pin-badge">{mine.length}</div>
        </Html>
      )}
    </Billboard>
  );
}

/** Exterior photos float beside the elevation they show. */
function ExteriorPins({ model, photos }: { model: HouseModel; photos: Photo[] }) {
  const b = useMemo(() => modelBounds(model.floors), [model]);
  const setUi = useUiSetter();
  const byElev = new Map<Elevation, Photo[]>();
  for (const p of photos) if (p.elevation) byElev.set(p.elevation, [...(byElev.get(p.elevation) ?? []), p]);
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.y0 + b.y1) / 2;
  const GAP = 2.6;
  const place = (e: Elevation, i: number, n: number): [number, number, number] => {
    const t = (i - (n - 1) / 2) * 2.4;
    switch (e) {
      case "front":
        return [cx + t, 1.8, b.y1 + GAP];
      case "rear":
        return [cx - t, 1.8, b.y0 - GAP];
      case "left":
        return [b.x0 - GAP, 1.8, cz - t];
      case "right":
        return [b.x1 + GAP, 1.8, cz + t];
    }
  };
  return (
    <group>
      {[...byElev.entries()].flatMap(([e, list]) =>
        list.map((p, i) => (
          <Billboard key={p.id} position={place(e, i, list.length)}>
            <Suspense fallback={null}>
              <DreiImage
                url={p.dataUrl}
                scale={[2.2, 1.5]}
                transparent
                onClick={(ev) => {
                  ev.stopPropagation();
                  setUi({ selectedPhotoId: p.id });
                }}
              />
            </Suspense>
          </Billboard>
        )),
      )}
    </group>
  );
}

// Small indirection so House doesn't import the store at module top (keeps it testable).
import { useStore } from "../store";
function useUiSetter() {
  return useStore((s) => s.setUi);
}
