import { useId, type ReactNode } from "react";
import { Icon } from "./icons";
import { useSectionOpen } from "./panelPrefs";
import { useReadOnly } from "./ReadOnly";

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
  const readOnly = useReadOnly();
  // Inside a disabled fieldset a button would not respond, but a read-only panel's sections must still open.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setOpen(!open);
  };
  const toggle = readOnly ? { role: "button", tabIndex: 0, onKeyDown: onKey } : { type: "button" as const };
  const Head = readOnly ? "div" : "button";
  return (
    <section className="sect" data-section={id}>
      <Head {...toggle} className="sect-head" aria-expanded={open} aria-controls={open ? body : undefined} onClick={() => setOpen(!open)}>
        <span className="sect-title">{title}</span>
        {!open && summary && <span className="sect-sum">{summary}</span>}
        <span className="sect-chev" aria-hidden="true">
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
        </span>
      </Head>
      {open && (
        <div className="sect-body" id={body}>
          {children}
        </div>
      )}
    </section>
  );
}
