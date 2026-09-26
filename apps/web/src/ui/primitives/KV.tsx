/* A list of labelled values: keys on the left, figures right-aligned in mono. */

import type { ReactNode } from "react";

import "./kv.css";

export function KV({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
