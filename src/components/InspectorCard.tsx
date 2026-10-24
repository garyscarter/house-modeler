import { useEffect, type ReactNode } from "react";
import { useStore } from "../store";
import { MODE_LABEL, MODE_SUBTITLE } from "../lib/modes";
import { usePanelPrefs } from "./panelPrefs";
import { Icon } from "./icons";
import { useChassis } from "./useChassis";
import { BottomSheet } from "./mobile/BottomSheet";
import "./Inspector.css";

/**
 * The floating card that holds a mode's inspector. Renders nothing without content, scrolls its body,
 * and collapses to its header (remembered per browser). Deliberately not role="dialog": that would switch off the plan's keys.
 */
export function InspectorCard({ title, className = "", children }: { title?: string; className?: string; children?: ReactNode }) {
  const mode = useStore((s) => s.mode);
  const collapsed = usePanelPrefs((s) => s.inspectorCollapsed);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const peek = useStore((s) => s.peek);
  const chassis = useChassis((s) => s.chassis);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  // A hover highlight from a row in this card must not outlive a change of selection.
  useEffect(() => {
    useStore.getState().setUi({ hoveredRoomId: null });
  }, [selectedRoomId]);
  if (!children) return null;
  const heading = title ?? MODE_LABEL[mode];
  if (chassis === "phone")
    return (
      <BottomSheet title={heading} subtitle={heading === MODE_LABEL[mode] ? MODE_SUBTITLE[mode] : undefined} className={className} peeking={peek} label={title ?? `${MODE_LABEL[mode]} inspector`}>
        {children}
      </BottomSheet>
    );
  return (
    <section className={`inspector-card float-card ${className}${peek ? " peeking" : ""}`.trim()}
      inert={peek} aria-label={title ?? `${MODE_LABEL[mode]} inspector`}>
      <div className="inspector-card-head">
        <div className="inspector-card-title">
          <h2>{heading}</h2>
          {heading === MODE_LABEL[mode] &&<p className="mode-sub">{MODE_SUBTITLE[mode]}</p>}
        </div>
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
