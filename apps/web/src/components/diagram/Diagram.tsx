/* Paints a laid-out diagram as SVG.
 *
 * Every decision about geometry is `layout.ts`'s; this file maps each placed
 * shape to its standard symbol and each tone to a CSS class, so colour lives
 * in the design tokens and never in a component.
 *
 * Text always sits inside a `g[data-surface]` whose first child is the shape
 * behind it. That is what lets the browser suite check every label's contrast
 * against the fill it is actually drawn on.
 */

import { useId, useMemo } from "react";

import "./diagram.css";
import { layout, METRICS, type Box, type PlacedEdge, type PlacedItem, type PlacedLane, type PlacedNode } from "./layout";
import type { DiagramSpec, EdgeKind } from "./model";
import { textWidth } from "./text";

const KINDS: EdgeKind[] = ["flow", "yes", "no", "seal", "commit"];

/** The dashed relations are named once, in a legend, rather than on every line. */
const LEGEND = { seal: "sealed to", commit: "commits to" } as const satisfies Partial<Record<EdgeKind, string>>;

/**
 * Below this fraction of its natural size a diagram's labels would drop under
 * about 10 px, so a narrow screen scrolls the card sideways instead of
 * shrinking it further.
 */
const MIN_SCALE = 0.78;

export function Diagram({ spec }: { spec: DiagramSpec }) {
  const geometry = useMemo(() => layout(spec), [spec]);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const arrow = (kind: EdgeKind) => `${uid}-arrow-${kind}`;
  const legend = (Object.keys(LEGEND) as Array<keyof typeof LEGEND>).filter((kind) =>
    spec.edges.some((edge) => edge.kind === kind),
  );

  return (
    <figure className="dg">
      <figcaption className="dg-caption">
        <span>{spec.title}</span>
        {legend.length > 0 && (
          <span className="dg-legend">
            {legend.map((kind) => (
              <span key={kind} className={`dg-legend-item dg-edge-${kind}`}>
                <svg width="26" height="8" aria-hidden="true">
                  <line x1="1" y1="4" x2="25" y2="4" />
                </svg>
                {LEGEND[kind]}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="dg-scroll" tabIndex={0} role="group" aria-label={`${spec.title} — scrolls sideways on narrow screens`}>
        <svg
          role="img"
          aria-labelledby={`${uid}-title ${uid}-desc`}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          width={geometry.width}
          height={geometry.height}
          style={{ minWidth: Math.round(geometry.width * MIN_SCALE), maxWidth: geometry.width }}
        >
          <title id={`${uid}-title`}>{spec.title}</title>
          <desc id={`${uid}-desc`}>{spec.description}</desc>
          <defs>
            {KINDS.map((kind) => (
              <marker
                key={kind}
                id={arrow(kind)}
                className={`dg-arrow dg-edge-${kind}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="9"
                markerHeight="9"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M0.5,0.8 L9.5,5 L0.5,9.2 Z" />
              </marker>
            ))}
          </defs>
          {geometry.lanes.map((lane, i) => (
            <LaneBand key={lane.id} lane={lane} first={i === 0} />
          ))}
          {geometry.nodes.map((node) => (
            <Node key={node.id} node={node} />
          ))}
          {geometry.edges.map((edge, i) => (
            <path
              key={i}
              className={`dg-edge dg-edge-${edge.kind}`}
              d={pathOf(edge)}
              markerEnd={`url(#${arrow(edge.kind)})`}
            />
          ))}
          {geometry.edges.map((edge, i) => (edge.label ? <EdgeLabel key={i} edge={edge} /> : null))}
        </svg>
      </div>
    </figure>
  );
}

/**
 * Orthogonal path with softened corners. The radius shrinks on short
 * segments so a corner never overshoots the segment it joins.
 */
function pathOf(edge: PlacedEdge): string {
  const p = edge.points;
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]];
    const r = Math.min(8, dist(a, b) / 2, dist(b, c) / 2);
    const inX = b.x - Math.sign(b.x - a.x) * r;
    const inY = b.y - Math.sign(b.y - a.y) * r;
    const outX = b.x + Math.sign(c.x - b.x) * r;
    const outY = b.y + Math.sign(c.y - b.y) * r;
    d += ` L${inX},${inY} Q${b.x},${b.y} ${outX},${outY}`;
  }
  const last = p[p.length - 1];
  return `${d} L${last.x},${last.y}`;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function LaneBand({ lane, first }: { lane: PlacedLane; first: boolean }) {
  const { box } = lane;
  const w = lane.label ? Math.min(box.w - 24, textWidth(lane.label, 12) + 26) : 0;
  return (
    <g className={`dg-lane dg-tone-${lane.tone}`}>
      {lane.label && <rect className="dg-lane-band" x={box.x + 4} y={box.y} width={box.w - 8} height={box.h} rx={14} />}
      {!first && lane.label && <line className="dg-lane-rule" x1={box.x} y1={box.y + 8} x2={box.x} y2={box.y + box.h - 8} />}
      {lane.label && (
        <g data-surface="">
          <rect className="dg-lane-chip" x={box.x + box.w / 2 - w / 2} y={box.y + 10} width={w} height={24} rx={12} />
          <text className="dg-lane-label" x={box.x + box.w / 2} y={box.y + 26.5} textAnchor="middle">
            {lane.label}
          </text>
        </g>
      )}
    </g>
  );
}

/** Centred lines of text, vertically centred on `cy`. */
function Lines({ lines, cx, cy, size = METRICS.font, step = METRICS.line, className = "dg-text" }: {
  lines: string[];
  cx: number;
  cy: number;
  size?: number;
  step?: number;
  className?: string;
}) {
  const first = cy - ((lines.length - 1) * step) / 2 + size * 0.36;
  return (
    <text className={className} x={cx} y={first} textAnchor="middle">
      {lines.map((line, i) => (
        <tspan key={i} x={cx} dy={i === 0 ? 0 : step}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Node({ node }: { node: PlacedNode }) {
  const { box } = node;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const tone = `dg-node dg-${node.kind} dg-tone-${node.tone}`;
  switch (node.kind) {
    case "terminal":
      return (
        <g className={tone} data-surface="">
          <rect className="dg-shape" x={box.x} y={box.y} width={box.w} height={box.h} rx={box.h / 2} />
          <Lines lines={node.lines} cx={cx} cy={cy} className="dg-text dg-strong" />
        </g>
      );
    case "process": {
      const labelH = node.lines.length * METRICS.line;
      const detailH = node.detail.length ? 4 + node.detail.length * METRICS.detailLine : 0;
      const top = cy - (labelH + detailH) / 2;
      return (
        <g className={tone} data-surface="">
          <rect className="dg-shape" x={box.x} y={box.y} width={box.w} height={box.h} rx={10} />
          <Lines lines={node.lines} cx={cx} cy={top + labelH / 2} className="dg-text dg-strong" />
          {node.detail.length > 0 && (
            <Lines
              lines={node.detail}
              cx={cx}
              cy={top + labelH + 4 + (node.detail.length * METRICS.detailLine) / 2}
              size={METRICS.detailFont}
              step={METRICS.detailLine}
              className="dg-text dg-dim"
            />
          )}
        </g>
      );
    }
    case "decision":
      return (
        <g className={tone} data-surface="">
          <polygon
            className="dg-shape"
            points={`${cx},${box.y} ${box.x + box.w},${cy} ${cx},${box.y + box.h} ${box.x},${cy}`}
            strokeLinejoin="round"
          />
          <Lines lines={node.lines} cx={cx} cy={cy} className="dg-text dg-strong" />
        </g>
      );
    case "note": {
      const fold = 12;
      const r = box.x + box.w;
      return (
        <g className={tone} data-surface="">
          <path
            className="dg-shape"
            d={`M${box.x},${box.y} H${r - fold} L${r},${box.y + fold} V${box.y + box.h} H${box.x} Z`}
          />
          <path className="dg-fold" d={`M${r - fold},${box.y} V${box.y + fold} H${r}`} />
          <Lines lines={node.lines} cx={cx} cy={cy} size={12} step={16} />
        </g>
      );
    }
    case "cell":
      return <Cell node={node} />;
    case "transaction":
      return <Transaction node={node} />;
  }
}

/** A band across the top of a rounded box, rounded only where the box is. */
function headerPath(box: Box, height: number, r: number): string {
  const { x, y, w } = box;
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + height} Z`;
}

function Cell({ node }: { node: Extract<PlacedNode, { kind: "cell" }> }) {
  const { box } = node;
  return (
    <g className={`dg-node dg-cell dg-tone-${node.tone}`}>
      <g data-surface="">
        <rect className="dg-shape dg-paper" x={box.x} y={box.y} width={box.w} height={box.h} rx={10} />
        {node.fields.map((f) => (
          <g key={f.key}>
            <text className="dg-key" x={box.x + 12} y={f.y + 11}>
              {f.key}
            </text>
            <text className="dg-mono" x={box.x + 12 + 58} y={f.y + 11}>
              {f.value.map((line, i) => (
                <tspan key={i} x={box.x + 12 + 58} dy={i === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ))}
      </g>
      <g data-surface="">
        <path className="dg-head" d={headerPath(box, 30, 10)} />
        <text className="dg-text dg-strong" x={box.x + 12} y={box.y + 19.5}>
          {node.title}
        </text>
      </g>
      {node.bytes.map((b) => (
        <g key={b.label} data-surface="">
          <rect className="dg-byte" x={b.box.x} y={b.box.y} width={b.box.w} height={b.box.h} />
          <text className="dg-byte-label" x={b.box.x + b.box.w / 2} y={b.box.y + 12.5} textAnchor="middle">
            {b.label}
            <tspan className="dg-byte-size" x={b.box.x + b.box.w / 2} dy={12}>
              {b.bytes} {b.bytes === 1 ? "byte" : "bytes"}
            </tspan>
          </text>
        </g>
      ))}
    </g>
  );
}

function Transaction({ node }: { node: Extract<PlacedNode, { kind: "transaction" }> }) {
  const { box, columns } = node;
  return (
    <g className={`dg-node dg-transaction dg-tone-${node.tone}`}>
      <g data-surface="">
        <rect className="dg-shape dg-tx-body" x={box.x} y={box.y} width={box.w} height={box.h} rx={14} />
        {(["Inputs", "Outputs"] as const).map((heading, i) => (
          <text key={heading} className="dg-key" x={columns.x[i]} y={columns.headerY + 12}>
            {heading.toUpperCase()}
          </text>
        ))}
      </g>
      <g data-surface="">
        <path className="dg-head" d={headerPath(box, 34, 14)} />
        <text className="dg-text dg-strong" x={box.x + 14} y={box.y + 22}>
          {node.title}
        </text>
      </g>
      {[...columns.inputs, ...columns.outputs].map((placed) => (
        <Item key={placed.item.id} placed={placed} tone={placed.item.tone ?? node.tone} />
      ))}
    </g>
  );
}

function Item({ placed, tone }: { placed: PlacedItem; tone: string }) {
  const { box, item } = placed;
  return (
    <g className={`dg-item dg-tone-${tone}`} data-surface="">
      <rect className="dg-shape" x={box.x} y={box.y} width={box.w} height={box.h} rx={8} />
      <text className="dg-text dg-item-label" x={box.x + 10} y={box.y + 20}>
        {placed.lines.map((line, i) => (
          <tspan key={i} x={box.x + 10} dy={i === 0 ? 0 : 16}>
            {line}
          </tspan>
        ))}
      </text>
      {item.value && (
        <text className="dg-mono dg-value" x={box.x + box.w - 10} y={box.y + 20} textAnchor="end">
          {item.value}
        </text>
      )}
      {placed.detail.length > 0 && (
        <text className="dg-text dg-dim dg-item-detail" x={box.x + 10} y={box.y + 20 + placed.lines.length * 16 - 1}>
          {placed.detail.map((line, i) => (
            <tspan key={i} x={box.x + 10} dy={i === 0 ? 0 : 14}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

function EdgeLabel({ edge }: { edge: PlacedEdge }) {
  const label = edge.label!;
  const h = METRICS.labelHeight;
  return (
    <g className={`dg-edge-label dg-edge-${edge.kind}`} data-surface="">
      <rect x={label.at.x - label.w / 2} y={label.at.y - h / 2} width={label.w} height={h} rx={h / 2} />
      <text x={label.at.x} y={label.at.y + 4} textAnchor="middle">
        {label.text}
      </text>
    </g>
  );
}
