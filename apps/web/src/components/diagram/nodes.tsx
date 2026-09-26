/* The node painters: each placed node kind drawn as its standard flowchart
 * symbol — terminal, process, decision, note — plus the two structured shapes,
 * a CKB cell with its fields and byte strip and a transaction with its input
 * and output columns. Geometry is already decided (`layout/`); these only map
 * it to SVG, with every label inside a `g[data-surface]` over its shape so the
 * browser suite can check contrast against the fill it sits on. */

import { METRICS, type Box, type PlacedItem, type PlacedNode } from "./layout";

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

export function Node({ node }: { node: PlacedNode }) {
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
