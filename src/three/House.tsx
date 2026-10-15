import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Billboard, Html, Image as DreiImage } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Elevation, Floor, HouseModel, Photo, Room } from "../types";
import { exteriorOf } from "../lib/roof";
import { wallThickness } from "../lib/walls";
import { Roof } from "./Roof";
import { Fixtures } from "./Fixtures";
import { RoomLabels } from "./RoomLabels";
import { GROUND_Y } from "./Site";
import { buildShell } from "./shell";
import { FLOOR_COLOUR, getMaterial, type MatSpec } from "./textures";
import {
  type WallSeg,
  WALL_T,
  buildWalls,
  diffWalls,
  modelBounds,
  polygonCentroid,
  roomWorldPolygon,
  toWorld,
  type V2,
  type WallPiece,
} from "../lib/geometry";

export { WALL_T };

export function floorBaseY(model: HouseModel, floor: Floor) {
  return floor.level * (model.ceilingHeight + model.slabThickness);
}

const ROOM_COLORS: Record<string, string> = {
  kitchen: "#e8d9b5",
  bath: "#cfe3ec",
  shower: "#cfe3ec",
  wc: "#cfe3ec",
  "en-suite": "#cfe3ec",
  ensuite: "#cfe3ec",
  bed: "#e3d5e6",
  living: "#d9e4cf",
  lounge: "#d9e4cf",
  recep: "#d9e4cf",
  sitting: "#d9e4cf",
  dining: "#e6dcc8",
  hall: "#e2e2dc",
  landing: "#e2e2dc",
  garage: "#cfcfcf",
  util: "#dcdcd0",
  study: "#d6dfe8",
  office: "#d6dfe8",
  conserv: "#d8ebe0",
  store: "#d9d9d9",
  cupboard: "#d9d9d9",
};

export function roomColor(room: Room): string {
  if (room.color) return room.color;
  const n = room.name.toLowerCase();
  for (const k of Object.keys(ROOM_COLORS)) if (n.includes(k)) return ROOM_COLORS[k];
  return "#e4e1d8";
}

interface HouseProps {
  model: HouseModel;
  photos: Photo[];
  ghost?: boolean;
  showLabels?: boolean;
  showCeilings?: boolean;
  selectedRoomId?: string | null;
  onSelectRoom?: (floor: Floor, room: Room) => void;
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

export function House({
  model,
  photos,
  ghost,
  showLabels = true,
  showCeilings = false,
  selectedRoomId,
  onSelectRoom,
  visibleLevels,
  diffAgainst,
  showExterior,
}: HouseProps) {
  const ext = exteriorOf(model);
  const floors = model.floors.filter((f) => !visibleLevels || visibleLevels.includes(f.level));
  // Labels go on the topmost visible floor only: lower floors' labels would
  // be read through the floors and walls above them (see RoomLabels).
  const labelLevel = floors.length ? Math.max(...floors.map((f) => f.level)) : null;
  return (
    <group>
      {showExterior && !ghost && ext.showRoof && <Roof model={model} />}
      {showExterior && !ghost && <ExteriorPins model={model} photos={photos} />}
      {floors.map((floor) => (
        <FloorGroup
          key={floor.id}
          model={model}
          floor={floor}
          photos={photos}
          ghost={!!ghost}
          showLabels={showLabels && floor.level === labelLevel}
          showCeilings={showCeilings}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
          otherFloor={diffAgainst?.floors.find((f) => f.level === floor.level) ?? null}
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
  showCeilings,
  selectedRoomId,
  onSelectRoom,
  otherFloor,
}: {
  model: HouseModel;
  floor: Floor;
  photos: Photo[];
  ghost: boolean;
  showLabels: boolean;
  showCeilings: boolean;
  selectedRoomId?: string | null;
  onSelectRoom?: (floor: Floor, room: Room) => void;
  otherFloor?: Floor | null;
}) {
  const y0 = floorBaseY(model, floor);
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
      <FloorShell model={model} floor={floor} walls={allWalls} photos={photos} selectedRoomId={selectedRoomId} onSelectRoom={onSelectRoom} />
      {showCeilings && floor.rooms.map((room) => <RoomCeiling key={room.id} floor={floor} room={room} height={H} />)}

      {otherWalls &&
        changed.map((w, i) => (
          <WallBox key={"new" + i} piece={{ a: w.a, b: w.b, y0: 0, y1: H }} thickness={wallThickness(w) + 0.04}>
            <meshStandardMaterial color="#16a34a" transparent opacity={0.55} depthWrite={false} />
          </WallBox>
        ))}

      {floor.stairs && hasAbove && <Stairs floor={floor} height={H + model.slabThickness} />}

      <Fixtures floor={floor} />

      {showLabels && <RoomLabels floor={floor} baseY={y0} ceiling={H} />}

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
}: {
  model: HouseModel;
  floor: Floor;
  walls: WallSeg[];
  photos: Photo[];
  selectedRoomId?: string | null;
  onSelectRoom?: (floor: Floor, room: Room) => void;
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
  const finish = ext.wallFinish ?? "render";
  const shell = useMemo(
    () =>
      buildShell({
        floor,
        walls,
        ceiling: H,
        slab,
        upperPolys,
        // The lowest floor's external walls run down to the garden.
        plinthY: floor.level === lowest ? GROUND_Y - baseY - 0.02 : null,
        baseY,
        wallFinish: finish,
        wallColor: ext.wallColor,
        trimColor: ext.trimColor,
      }),
    [floor, walls, H, slab, upperPolys, lowest, baseY, finish, ext.wallColor, ext.trimColor],
  );
  useEffect(() => () => shell.meshes.forEach((m) => m.geometry.dispose()), [shell]);

  // One slab under all the rooms so nothing floats.
  const slabGeom = useMemo(() => {
    const parts = floor.rooms.map((r) => new THREE.ExtrudeGeometry(shapeFrom(roomWorldPolygon(floor, r)), { depth: slab, bevelEnabled: false }));
    const merged = parts.length ? mergeGeometries(parts) : null;
    parts.forEach((g) => g.dispose());
    return merged;
  }, [floor, slab]);
  useEffect(() => () => slabGeom?.dispose(), [slabGeom]);

  const roomsById = useMemo(() => new Map(floor.rooms.map((r) => [r.id, r])), [floor.rooms]);
  const polys = useMemo(() => floor.rooms.map((r) => roomWorldPolygon(floor, r)), [floor]);
  return (
    <group>
      {slabGeom && <mesh geometry={slabGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, -slab, 0]} material={getMaterial(SLAB)} receiveShadow />}
      {floor.rooms.map((room, i) => (
        <RoomFloor
          key={room.id}
          room={room}
          poly={polys[i]}
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
            poly={b.poly}
            photos={photos}
            selected={room.id === selectedRoomId}
            onSelect={() => onSelectRoom?.(floor, room)}
          />
        ) : null;
      })}
      {shell.meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={getMaterial(m.spec)} castShadow={m.castShadow} receiveShadow />
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
  return { kind: "floor", finish, color: room.color ?? FLOOR_COLOUR[finish], selected };
}

function RoomFloor({ room, poly, photos, selected, onSelect }: { room: Room; poly: V2[]; photos: Photo[]; selected: boolean; onSelect: () => void }) {
  // Shape coordinates are metres, so the UVs keep boards and tiles at their real size.
  const geom = useMemo(() => new THREE.ShapeGeometry(shapeFrom(poly)), [poly]);
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

function RoomCeiling({ floor, room, height }: { floor: Floor; room: Room; height: number }) {
  const poly = useMemo(() => roomWorldPolygon(floor, room), [floor, room]);
  const geom = useMemo(() => new THREE.ShapeGeometry(shapeFrom(poly)), [poly]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, height, 0]}>
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

/** A straight flight from this floor to the one above, rising in `stairsDir`. */
function Stairs({ floor, height }: { floor: Floor; height: number }) {
  const c = toWorld(floor, floor.stairs!);
  const run = floor.stairsLen ?? 2.6;
  const w = floor.stairsWidth ?? 0.9;
  const steps = Math.max(6, Math.round(run / 0.25));
  // Local flight rises towards +z; rotate so +z points in the chosen plan direction.
  const rot = { down: 0, up: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 }[floor.stairsDir ?? "up"];
  return (
    <group position={[c.x, 0, c.y]} rotation={[0, rot, 0]}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[0, ((i + 0.5) * height) / steps, -run / 2 + ((i + 0.5) * run) / steps]} castShadow material={getMaterial(STAIR)}>
          <boxGeometry args={[w, height / steps, run / steps]} />
        </mesh>
      ))}
    </group>
  );
}

const STAIR: MatSpec = { kind: "plain", color: "#a89a86", roughness: 0.8 };

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
