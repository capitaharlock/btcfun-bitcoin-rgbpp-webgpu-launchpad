/* A page's title line: a pixel heading, at most one line under it, and the
 * page's status and actions on the right.
 */

import type { ReactNode } from "react";

import "./page-head.css";

export function PageHead({
  eyebrow,
  title,
  lede,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      <span className="spacer" />
      {aside && <div className="row wrapped">{aside}</div>}
    </header>
  );
}
