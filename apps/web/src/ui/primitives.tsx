import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from "react";

import { Sigil } from "./Sigil";

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
        style={{ width: `${share * 100}%`, ...(color ? { "--meter": color } : {}) } as React.CSSProperties}
      />
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

/**
 * Everything a screen explains beyond its first line, folded.
 *
 * A native <details>: it opens from the keyboard, is announced as expandable,
 * and keeps no state of its own. Folded content stays in the page, so a
 * search or a screen reader can still reach it.
 */
export function More({
  children,
  summary = "More",
  boxed,
}: {
  children: ReactNode;
  summary?: string;
  /** Draw it as a box of its own, for use outside a panel. */
  boxed?: boolean;
}) {
  return (
    <details className={`more${boxed ? " boxed" : ""}`}>
      <summary>{summary}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

/** A page's title line: a pixel heading, at most one line under it, and the
 *  page's status and actions on the right. */
export function PageHead({
  eyebrow,
  title,
  lede,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      <span className="spacer" />
      {aside && <div className="row wrapped">{aside}</div>}
    </header>
  );
}

/** A section's title, with a small invader beside it and an optional count. */
export function SectionHead({ title, count, id }: { title: string; count?: number; id?: string }) {
  return (
    <div className="sectionhead">
      <Sigil seed={`section:${title}`} accent="var(--play)" size="sm" still />
      <h2 id={id}>{title}</h2>
      {count !== undefined && <span className="count">{count}</span>}
    </div>
  );
}

/** Prose clamped to two lines, with a button to read the rest when there is more. */
export function Clamp({ text, limit = 150 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return (
    <>
      <p className={`clamp${long && !open ? " shut" : ""}`}>{text}</p>
      {long && (
        <button type="button" className="linkbutton" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Less" : "More"}
        </button>
      )}
    </>
  );
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
