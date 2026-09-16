/* Building blocks every docs page shares. */

import type { ReactNode } from "react";

/**
 * The technical layer of a page: folded, so the plain explanation above it
 * reads on its own, and one click away for anyone who wants the mechanism.
 */
export function Technical({ children, title = "Technical detail" }: { children: ReactNode; title?: string }) {
  return (
    <details className="docs-tech">
      <summary>
        {title} <span className="faint">— for engineers</span>
      </summary>
      <div>{children}</div>
    </details>
  );
}

/** A formula or a block of constants, set in monospace and never reflowed. */
export function Formula({ children }: { children: string }) {
  return <pre className="docs-formula">{children}</pre>;
}

/** A link to another docs page. */
export function DocLink({ to, children }: { to: string; children: ReactNode }) {
  return <a href={`#/docs/${to}`}>{children}</a>;
}
