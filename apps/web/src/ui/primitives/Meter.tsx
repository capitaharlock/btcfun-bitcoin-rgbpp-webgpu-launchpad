/* A horizontal bar showing a share of a whole: emission spent, a halving's
 * progress, a balance's split. Announced as a meter when it has a label.
 */

import type { CSSProperties } from "react";

import "./meter.css";

export function Meter({
  value,
  tone,
  color,
  label,
}: {
  value: number;
  tone?: "burn" | "cyan";
  /** A colour of its own, such as a launch's accent; overrides the tone. */
  color?: string;
  /** What the bar measures, for assistive technology. */
  label?: string;
}) {
  const share = Math.max(0, Math.min(1, value));
  return (
    <div
      className="meter"
      role={label ? "meter" : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(share * 100) : undefined}
    >
      <i
        className={tone ?? ""}
        style={{ width: `${share * 100}%`, ...(color ? { "--meter": color } : {}) } as CSSProperties}
      />
    </div>
  );
}
