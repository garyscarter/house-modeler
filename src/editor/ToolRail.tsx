import { Fragment, type ReactNode } from "react";
import { Icon, type IconName } from "../components/icons";
import { tip } from "../lib/shortcuts";

export interface RailItem {
  id: string;
  icon: IconName;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  /** A toggle (shows aria-pressed) rather than a tool. */
  toggle?: boolean;
  onClick: () => void;
  /** Rendered beside the button inside its slot: a popover that opens to the right, or a small companion button. */
  extra?: ReactNode;
}

/** One rail button; the tooltip carries the shortcut, "Rectangle room (R)". */
export function RailButton({ item }: { item: RailItem }) {
  const t = tip(item.label, item.shortcut);
  const button = (
    <button
      type="button"
      className={item.active ? "icon-btn active" : "icon-btn"}
      data-tool={item.id}
      aria-label={t}
      title={t}
      aria-pressed={item.toggle ? !!item.active : undefined}
      disabled={item.disabled}
      onClick={item.onClick}
    >
      <Icon name={item.icon} size={20} />
    </button>
  );
  return item.extra ? (
    <div className="rail-slot">
      {button}
      {item.extra}
    </div>
  ) : (
    button
  );
}

/** The plan's vertical tool column: groups divided by hairlines, an optional footer (the hint) at the bottom. */
export function ToolRail({ groups, footer }: { groups: RailItem[][]; footer?: ReactNode }) {
  return (
    <nav className="tool-rail float-card" aria-label="Plan tools">
      {groups
        .filter((g) => g.length)
        .map((g, i) => (
          <Fragment key={i}>
            {i > 0 && <hr className="rail-sep" />}
            {g.map((item) => (
              <RailButton key={item.id} item={item} />
            ))}
          </Fragment>
        ))}
      {footer && (
        <>
          <hr className="rail-sep" />
          <div className="rail-footer">{footer}</div>
        </>
      )}
    </nav>
  );
}
