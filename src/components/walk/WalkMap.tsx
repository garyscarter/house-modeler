import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../../store";
import { useWalk } from "../../walkStore";
import { siteOf } from "../../lib/sites";
import { roomWorldPolygon } from "../../lib/geometry";
import { pathFor } from "../../lib/footprint";
import { mapFit, mapToWorld, markerTransform, roomUnder } from "../../lib/walkMap";
import { useChassis } from "../useChassis";

/** The current level as a small plan, with a dot and view cone for you. The marker moves by a transform set outside React. */
export function WalkMap() {
  const phone = useChassis((s) => s.chassis) === "phone";
  const size = phone ? 120 : 180;
  const showMap = useWalk((s) => s.showMap);
  const has = useWalk((s) => s.pose !== null);
  const level = useWalk((s) => s.pose?.level ?? 0);
  const roomName = useWalk((s) => s.where?.roomName ?? null);
  const outside = useWalk((s) => s.where?.outside ?? false);
  const floors = useStore((s) => s.variants[s.activeVariant]?.floors);
  const plot = useStore((s) => siteOf(s.sites, s.activeVariant)?.boundary);
  const marker = useRef<SVGGElement>(null);

  const rooms = useMemo(() => {
    const floor = floors?.find((f) => f.level === level) ?? floors?.[0];
    return floor ? floor.rooms.map((r) => ({ id: r.id, name: r.name, poly: roomWorldPolygon(floor, r) })) : [];
  }, [floors, level]);
  const plotPoly = outside && level === 0 && plot && plot.length > 2 ? plot : null;
  const fit = useMemo(() => mapFit([...rooms.map((r) => r.poly), ...(plotPoly ? [plotPoly] : [])], size), [rooms, plotPoly, size]);

  // Move the marker without rendering: once now, then on every pose change.
  useEffect(() => {
    const apply = () => {
      const p = useWalk.getState().pose;
      if (p && marker.current) marker.current.setAttribute("transform", markerTransform(fit, p));
    };
    apply();
    return useWalk.subscribe((s, prev) => {
      if (s.pose !== prev.pose) apply();
    });
  }, [fit, showMap, has]);

  if (!showMap || !has) return null;

  const tap = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * size;
    const py = ((e.clientY - box.top) / box.height) * size;
    const id = roomUnder(fit, rooms, px, py);
    if (id) useWalk.getState().requestGoal({ kind: "room", level, roomId: id });
    else if (plotPoly) useWalk.getState().requestGoal({ kind: "point", level: 0, at: mapToWorld(fit, px, py) });
  };

  return (
    <div className="walk-map float-card" aria-label="Mini-map">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onClick={tap} role="img" aria-label={roomName ? `Map: you are in ${roomName}` : "Map"}>
        {plotPoly && <path className="wm-plot" d={pathFor(plotPoly, fit)} />}
        {rooms.map((r) => (
          <path key={r.id} className={r.name === roomName ? "wm-room wm-here" : "wm-room"} data-room-id={r.id} d={pathFor(r.poly, fit)}>
            <title>{r.name}</title>
          </path>
        ))}
        <g ref={marker} className="wm-marker">
          <path className="wm-cone" d="M0 0L-9.2 -16 A18.5 18.5 0 0 1 9.2 -16Z" />
          <circle className="wm-dot" r="4.5" />
        </g>
      </svg>
    </div>
  );
}
