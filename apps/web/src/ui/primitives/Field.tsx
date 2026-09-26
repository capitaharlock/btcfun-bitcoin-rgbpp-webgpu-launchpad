/* A labelled form field.
 *
 * The label is associated with its control, not merely placed above it: a
 * screen reader announces it on focus, clicking it focuses the input, and a
 * test can find the input by what a person reads. A single native control gets
 * the label through `htmlFor`; anything else — a row of colour swatches — is
 * wrapped in a group named by the label, because a `<label>` wrapping several
 * buttons would forward every click to the first one.
 */

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import "./field.css";

/** Elements a `<label for>` can name. */
const CONTROLS = new Set(["input", "select", "textarea"]);

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const control =
    isValidElement(children) && typeof children.type === "string" && CONTROLS.has(children.type)
      ? (children as ReactElement<{ id?: string }>)
      : null;
  const controlId = control?.props.id ?? `${id}-control`;

  return (
    <div className="field">
      <label id={labelId} htmlFor={control ? controlId : undefined}>
        {label}
        {hint && <span className="faint"> · {hint}</span>}
      </label>
      {control ? (
        cloneElement(control, { id: controlId })
      ) : (
        <div role="group" aria-labelledby={labelId}>
          {children}
        </div>
      )}
    </div>
  );
}
