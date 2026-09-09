import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

export function Panel({
  children,
  title,
  eyebrow,
  aside,
  className = "",
  tight,
  flush,
}: {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: string;
  aside?: ReactNode;
  className?: string;
  tight?: boolean;
  flush?: boolean;
}) {
  return (
    <section className={`panel ${tight ? "tight" : ""} ${flush ? "flush" : ""} ${className}`}>
      {(title || eyebrow || aside) && (
        <header className="panel-head" style={flush ? { padding: "16px 16px 0" } : undefined}>
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
          <div className="spacer" />
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

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

/** Stat tones follow the same palette meanings as chips. */
export type StatTone = "amber" | "cyan" | "violet" | "ok" | "danger";

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

export function Meter({ value, tone }: { value: number; tone?: "burn" | "cyan" }) {
  const pctWidth = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <div className="meter">
      <i className={tone ?? ""} style={{ width: pctWidth }} />
    </div>
  );
}

export function Notice({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "cyan" | "warn" | "danger";
}) {
  return <div className={`notice ${tone ?? ""}`}>{children}</div>;
}

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

/** Elements a `<label for>` can name. */
const CONTROLS = new Set(["input", "select", "textarea"]);

/**
 * A labelled form field.
 *
 * The label is associated with its control, not merely placed above it: a
 * screen reader announces it on focus, clicking it focuses the input, and a
 * test can find the input by what a person reads. A single native control gets
 * the label through `htmlFor`; anything else — a row of colour swatches — is
 * wrapped in a group named by the label, because a `<label>` wrapping several
 * buttons would forward every click to the first one.
 */
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
