import type { HTMLAttributes, ReactNode } from "react";

/**
 * The name of the thing being edited (display face, 18 px) with its one key
 * number set in mono on the right, and an optional muted line beneath.
 */
export function StatHeader({ title, stat, sub, ...rest }: { title: ReactNode; stat?: ReactNode; sub?: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, "title">) {
  return (
    <div className="stat-header" {...rest}>
      <div className="stat-line">
        <span className="stat-title">{title}</span>
        {stat !== undefined && <span className="stat-value">{stat}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
