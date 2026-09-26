/* A scoreboard counter: a label over a figure, with an optional unit and a
 * tone that means what the chips' tones mean.
 */

import type { ReactNode } from "react";

import "./stat.css";

/** Stat tones follow the same palette meanings as chips. */
export type StatTone = "amber" | "cyan" | "violet" | "ok" | "danger";

export function Stat({
  k,
  v,
  unit,
  tone,
  small,
  hint,
}: {
  k: string;
  v: ReactNode;
  unit?: string;
  tone?: StatTone;
  small?: boolean;
  hint?: string;
}) {
  return (
    <div className="stat" title={hint}>
      <div className="k">{k}</div>
      <div className={`v ${small ? "sm" : ""} ${tone ?? ""}`}>
        {v}
        {unit && <span className="u">{unit}</span>}
      </div>
    </div>
  );
}
