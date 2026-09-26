/* A large button standing in for an action already under way: disabled, and
 * announced as busy, with what is happening as its label. Pass a spinner among
 * the children where the surrounding design has one. Drawn by the global
 * `.btn` (`ui/styles/controls.css`), like every other button.
 */

import type { ReactNode } from "react";

export function BusyButton({ children }: { children: ReactNode }) {
  return (
    <button className="btn lg working" disabled aria-busy="true">
      {children}
    </button>
  );
}
