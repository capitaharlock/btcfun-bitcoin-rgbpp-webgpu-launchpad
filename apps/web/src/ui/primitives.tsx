import type { ReactNode } from "react";

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
  tone?: "amber" | "cyan" | "danger";
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

export function Chip({
  children,
  tone,
  live,
}: {
  children: ReactNode;
  tone?: "amber" | "cyan" | "ok" | "warn" | "danger";
  live?: boolean;
}) {
  return (
    <span className={`chip ${tone ?? ""}`}>
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
  tone?: "cyan" | "danger";
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

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {hint && <span className="faint"> · {hint}</span>}
      </label>
      {children}
    </div>
  );
}
