/* A section's title, with a small invader beside it and an optional count. */

import { Sigil } from "../Sigil";
import "./section-head.css";

export function SectionHead({ title, count, id }: { title: string; count?: number; id?: string }) {
  return (
    <div className="sectionhead">
      <Sigil seed={`section:${title}`} accent="var(--play)" size="sm" still />
      <h2 id={id}>{title}</h2>
      {count !== undefined && <span className="count">{count}</span>}
    </div>
  );
}
