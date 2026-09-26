/* A framed remark: neutral by default, because most notices here are caveats;
 * a tone for the few that warn or report a failure.
 */

import type { ReactNode } from "react";

import "./notice.css";

export function Notice({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "cyan" | "warn" | "danger";
}) {
  return <div className={`notice ${tone ?? ""}`}>{children}</div>;
}
