import { useId, type ReactNode } from "react";
import { Icon } from "./icons";
import { useSectionOpen } from "./panelPrefs";

/**
 * A collapsible group of fields. The header shows the title and, while the
 * section is closed, a one-line summary of what is inside. The body is only
 * rendered when open. The open state is remembered per browser (panelPrefs).
 */
export function Section({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  /** Prefixed by mode, e.g. "decorate.floor". */
  id: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useSectionOpen(id, defaultOpen);
  const body = useId();
  return (
    <section className="sect" data-section={id}>
      <button type="button" className="sect-head" aria-expanded={open} aria-controls={open ? body : undefined} onClick={() => setOpen(!open)}>
        <span className="sect-title">{title}</span>
        {!open && summary && <span className="sect-sum">{summary}</span>}
        <span className="sect-chev" aria-hidden="true">
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
        </span>
      </button>
      {open && (
        <div className="sect-body" id={body}>
          {children}
        </div>
      )}
    </section>
  );
}
