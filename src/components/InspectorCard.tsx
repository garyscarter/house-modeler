import type { ReactNode } from "react";
import { useStore } from "../store";
import { MODE_LABEL } from "../lib/modes";
import { usePanelPrefs } from "./panelPrefs";
import { Icon } from "./icons";

/**
 * The floating card that holds a mode's inspector. Renders nothing without content, scrolls its body,
 * and collapses to its header (remembered per browser). Deliberately not role="dialog": that would switch off the plan's keys.
 */
export function InspectorCard({ title, className = "", children }: { title?: string; className?: string; children?: ReactNode }) {
  const mode = useStore((s) => s.mode);
  const collapsed = usePanelPrefs((s) => s.inspectorCollapsed);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  if (!children) return null;
  const heading = title ?? MODE_LABEL[mode];
  return (
    <section className={`inspector-card float-card ${className}`.trim()} aria-label={title ?? `${MODE_LABEL[mode]} inspector`}>
      <div className="inspector-card-head">
        <h2>{heading}</h2>
        <button
          type="button"
          className="inspector-card-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          title={collapsed ? "Expand" : "Collapse"}
          onClick={() => setPrefs({ inspectorCollapsed: !collapsed })}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronDown"} />
        </button>
      </div>
      {!collapsed && <div className="inspector-card-body">{children}</div>}
    </section>
  );
}
