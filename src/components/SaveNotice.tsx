import { useEffect, useState } from "react";
import { REFRESHED, useStorageStatus } from "../lib/persist";
import "./SaveNotice.css";

/** How long the "loaded the other tab's changes" line stays up. */
const REFRESHED_MS = 9000;

/**
 * A line at the top of the canvas when this tab is not the one saving the
 * project (another tab took over), and for a moment after this tab took over
 * and loaded the other tab's newer work. Nothing when all is well.
 */
export function SaveNotice() {
  const status = useStorageStatus();
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const refreshed = status.kind === "ok" && status.message === REFRESHED;
  useEffect(() => {
    if (!refreshed) return;
    setRefreshedAt(Date.now());
    const t = setTimeout(() => setRefreshedAt(null), REFRESHED_MS);
    return () => clearTimeout(t);
  }, [refreshed]);
  if (status.kind === "readonly") {
    return (
      <div className="save-notice float-card" role="status">
        <span>{status.message ?? "Another tab is saving this project. Your next change here takes over."}</span>
      </div>
    );
  }
  if (refreshed && refreshedAt !== null) {
    return (
      <div className="save-notice float-card" role="status">
        <span>{REFRESHED}</span>
      </div>
    );
  }
  return null;
}
