/* Everything a screen explains beyond its first line, folded.
 *
 * A native <details>: it opens from the keyboard, is announced as expandable,
 * and keeps no state of its own. Folded content stays in the page, so a
 * search or a screen reader can still reach it.
 */

import type { ReactNode } from "react";

import "./more.css";

export function More({
  children,
  summary = "More",
  boxed,
}: {
  children: ReactNode;
  summary?: string;
  /** Draw it as a box of its own, for use outside a panel. */
  boxed?: boolean;
}) {
  return (
    <details className={`more${boxed ? " boxed" : ""}`}>
      <summary>{summary}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}
