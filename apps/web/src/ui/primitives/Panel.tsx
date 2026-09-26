/* A framed surface with an optional title line. The generic container every
 * page is made of: it knows nothing about launches or chains, so a page reads
 * as its own content and the look stays in the theme's tokens.
 */

import type { ReactNode } from "react";

import "./panel.css";

export function Panel({
  children,
  title,
  eyebrow,
  aside,
  className = "",
  tight,
  flush,
}: {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: string;
  aside?: ReactNode;
  className?: string;
  tight?: boolean;
  flush?: boolean;
}) {
  return (
    <section className={`panel ${tight ? "tight" : ""} ${flush ? "flush" : ""} ${className}`}>
      {(title || eyebrow || aside) && (
        <header className="panel-head" style={flush ? { padding: "var(--space-5) var(--space-6) 0" } : undefined}>
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
          <div className="spacer" />
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
