import { useStore } from "../store";
import { listingSite } from "../lib/houses/listing91770873";

/** Plot, orientation and neighbours. */
export function SitePanel() {
  const site = useStore((s) => s.site);
  const setSite = useStore((s) => s.setSite);
  return (
    <div className="panel">
      <h3>Site</h3>
      {!site ? (
        <>
          <p className="muted">No site yet. The site holds the plot boundary, garden, neighbouring buildings and which way the house faces.</p>
          <button onClick={() => setSite(listingSite())}>Load site for listing 91770873</button>
        </>
      ) : (
        <p className="muted small">
          Front faces {site.frontBearing}°, {site.neighbours.length} neighbouring buildings, {site.surfaces.length} garden surfaces.
        </p>
      )}
    </div>
  );
}
