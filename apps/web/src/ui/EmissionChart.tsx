import { useId } from "react";
import { cumulative, maxAtoms, type Schedule } from "../lib/emission";

/**
 * Cumulative issuance ceiling A(n), drawn straight from the integer schedule —
 * no smoothing, no resampling of a different curve than the one the contract
 * would use. Milestone rules mark the candidate headline periods.
 */
export function EmissionChart({
  schedule,
  spanBlocks,
  markers = [],
  cursor,
  height = 190,
}: {
  schedule: Schedule;
  spanBlocks: bigint;
  markers?: Array<{ at: bigint; label: string }>;
  cursor?: bigint;
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const W = 1000;
  const H = height;
  const pad = { l: 0, r: 0, t: 12, b: 20 };
  const M = maxAtoms(schedule);
  const steps = 160;

  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const n = (spanBlocks * BigInt(i)) / BigInt(steps);
    const y = Number((cumulative(schedule, n) * 10000n) / M) / 10000;
    const x = pad.l + (i / steps) * (W - pad.l - pad.r);
    pts.push([x, pad.t + (1 - y) * (H - pad.t - pad.b)]);
  }

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - pad.b} L${pts[0][0].toFixed(1)},${H - pad.b} Z`;

  const xOf = (n: bigint) =>
    pad.l + (Number((n * 10000n) / spanBlocks) / 10000) * (W - pad.l - pad.r);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      role="img"
      aria-label="Cumulative issuance ceiling against Bitcoin block offset"
    >
      <defs>
        <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
          x1={0}
          x2={W}
          y1={pad.t + (1 - g) * (H - pad.t - pad.b)}
          y2={pad.t + (1 - g) * (H - pad.t - pad.b)}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray={g === 1 ? "0" : "2 5"}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <path d={area} fill={`url(#fill-${uid})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--amber)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />

      {markers.map((m) => {
        const x = xOf(m.at);
        if (x > W) return null;
        return (
          <g key={m.label}>
            <line
              x1={x}
              x2={x}
              y1={pad.t}
              y2={H - pad.b}
              stroke="var(--line-strong)"
              strokeWidth="1"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x + 6}
              y={H - pad.b + 14}
              fill="var(--ink-faint)"
              fontSize="11"
              fontFamily="var(--mono)"
            >
              {m.label}
            </text>
          </g>
        );
      })}

      {cursor !== undefined && cursor <= spanBlocks && (
        <line
          x1={xOf(cursor)}
          x2={xOf(cursor)}
          y1={pad.t}
          y2={H - pad.b}
          stroke="var(--cyan)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/** Small bar series used for per-epoch budgets and turnout. */
export function Bars({
  values,
  tone = "amber",
  height = 56,
}: {
  values: number[];
  tone?: "amber" | "cyan" | "danger";
  height?: number;
}) {
  const max = Math.max(...values, 1);
  const color = tone === "cyan" ? "var(--cyan)" : tone === "danger" ? "var(--danger)" : "var(--amber)";
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(2, (v / max) * 100)}%`,
            background: color,
            opacity: 0.35 + 0.65 * (v / max),
            borderRadius: 1.5,
            minWidth: 2,
          }}
        />
      ))}
    </div>
  );
}
