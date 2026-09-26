/* A modal dialog, square like every other panel.
 *
 * The native <dialog> opened with `showModal()`: the browser makes the rest of
 * the page inert (so focus cannot leave it), closes it on Escape, puts it in
 * the top layer and hands focus back to whatever opened it. Re-implementing any
 * of that in script is how modals end up trapping screen readers or leaking
 * focus behind the backdrop. `open` is the only state; the element follows it.
 */

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";

import "./dialog.css";

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  /** Room for two columns of choices. */
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A click on the backdrop lands on the <dialog> itself; one inside lands on
  // a descendant. Closing on the former is what every modal teaches people.
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? " wide" : ""}`}
      aria-modal="true"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={onBackdrop}
    >
      {open && (
        <div className="dialog-frame">
          <header className="dialog-head">
            <div>
              {eyebrow && <div className="eyebrow">{eyebrow}</div>}
              <h2 id={titleId}>{title}</h2>
            </div>
            <span className="spacer" />
            <button type="button" className="btn ghost sm" onClick={onClose}>
              Close
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
