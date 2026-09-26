/* Paints a laid-out diagram as SVG.
 *
 * Every decision about geometry is `layout/`'s; this file draws the frame —
 * caption, legend, lanes, edges and their labels — and hands each node to its
 * painter (`nodes.tsx`). Each tone is a CSS class, so colour lives in the
 * design tokens and never in a component.
 *
 * Text always sits inside a `g[data-surface]` whose first child is the shape
 * behind it. That is what lets the browser suite check every label's contrast
 * against the fill it is actually drawn on.
 */

import { useId, useMemo } from "react";

import "./diagram.css";
import { layout } from "./layout";
import { METRICS, type PlacedEdge, type PlacedLane } from "./layout/types";
import type { DiagramSpec, EdgeKind } from "./model";
import { Node } from "./nodes";
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
