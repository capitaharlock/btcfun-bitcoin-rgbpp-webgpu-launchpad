/* A small labelled tag: a status, a network, a count. Its tone is one of the
 * palette's signal colours, never an arbitrary hue, and `live` adds the
 * blinking LED that marks something happening now.
 */

import type { ReactNode } from "react";

import "./chip.css";

/** Chip tones map to the palette's signal colours, not to arbitrary hues. */
export type ChipTone = "amber" | "cyan" | "violet" | "ok" | "warn" | "danger";

export function Chip({
  children,
  tone,
  live,
  title,
}: {
  children: ReactNode;
  tone?: ChipTone;
  live?: boolean;
  /** Hover text. Used to carry a backend's full detail without crowding the chip. */
  title?: string;
}) {
  return (
    <span className={`chip ${tone ?? ""}`} title={title}>
      {live && <i className="dot live" />}
      {children}
    </span>
  );
}
