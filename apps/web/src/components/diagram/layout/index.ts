/* From a declared diagram to geometry.
 *
 * Pure: a `DiagramSpec` in, boxes, text lines and orthogonal polylines out.
 * The renderer paints this and decides nothing, so everything that can go
 * wrong with a diagram's shape — overlapping rows, a connector that leaves
 * from the wrong side, two gutter routes drawn on top of each other — is
 * decided, and tested, here.
 *
 * Rows are as tall as their tallest node and nodes are centred in their row,
 * so a horizontal edge between two nodes of one row is a straight line.
 * Connectors are routed with at most two bends, except routes that leave and
 * enter on the same side, which run through a gutter beside the nodes; nested
 * gutter routes are given nested gutters so they never overlap.
 *
 * This file is the whole-diagram pass — rows, placement, edges, fitting the
 * canvas — and the module's public face. Node sizing is `sizing.ts`, sides,
 * routes and gutters are `routing.ts`, the shared shapes are `types.ts`.
 */

import type { DiagramSpec } from "../model";
import { textWidth } from "../text";
import { assignGutters, defaultSides, itemSides, labelPoint, port, resolve, route } from "./routing";
import { size } from "./sizing";
import { METRICS as M, type Box, type Layout, type PlacedEdge, type PlacedItem, type PlacedLane, type PlacedNode, type Point } from "./types";

export * from "./types";
export { placeBytes } from "./sizing";
export { assignGutters, defaultSides, labelPoint, route, simplify } from "./routing";

export function layout(spec: DiagramSpec): Layout {
  const laneWidth = spec.laneWidth ?? M.laneWidth;
  const laneIndex = new Map(spec.lanes.map((lane, i) => [lane.id, i]));
  const headed = spec.lanes.some((lane) => lane.label);
  const top = M.pad + (headed ? M.laneHeader : 0);

  const sized = spec.nodes.map((node) => {
    const index = laneIndex.get(node.lane);
    if (index === undefined) throw new Error(`diagram node ${node.id} is on an unknown lane: ${node.lane}`);
    return { ...size(node, laneWidth), index };
  });

  const rows = Math.max(0, ...spec.nodes.map((n) => n.row)) + 1;
  const rowHeight = Array.from({ length: rows }, (_, r) =>
    Math.max(0, ...sized.filter((s) => s.node.row === r).map((s) => s.h)),
  );
  const rowTop: number[] = [];
  rowHeight.reduce((y, h, r) => {
    rowTop[r] = y;
    return y + h + (h > 0 ? M.rowGap : 0);
  }, top);

  const placed = sized.map((s) => {
    const span = s.node.span ?? 1;
    const cx = M.pad + (s.index + span / 2) * laneWidth;
    const y = rowTop[s.node.row] + (rowHeight[s.node.row] - s.h) / 2;
    return s.place(cx - s.w / 2, y);
  });
  const byId = new Map(placed.map((n) => [n.id, n]));
  if (byId.size !== placed.length) throw new Error("diagram node ids must be unique");

  const contentBottom = rowTop[rows - 1] + rowHeight[rows - 1];

  // Resolve sides first: gutter routes are assigned their gutters together.
  const ends = spec.edges.map((edge) => {
    const from = resolve(byId, edge.from);
    const to = resolve(byId, edge.to);
    const [autoFrom, autoTo] = from.item || to.item
      ? itemSides(from, to)
      : defaultSides(from.node.box, to.node.box, from.node.kind === "decision");
    return { edge, a: port(from, edge.fromSide ?? autoFrom), b: port(to, edge.toSide ?? autoTo) };
  });

  const gutters = assignGutters(ends.map(({ a, b }) => ({ a, b })));

  const edges: PlacedEdge[] = ends.map(({ edge, a, b }, i) => {
    const kind = edge.kind ?? "flow";
    const points = route(a, b, gutters[i]);
    const text = edge.label ?? (kind === "yes" ? "yes" : kind === "no" ? "no" : null);
    const label = text
      ? { text, at: labelPoint(points, kind === "yes" || kind === "no"), w: textWidth(text, M.labelFont) + 14 }
      : null;
    return { kind, points, label };
  });

  const lanes: PlacedLane[] = spec.lanes.map((lane, i) => ({
    ...lane,
    tone: lane.tone ?? "slate",
    box: { x: M.pad + i * laneWidth, y: M.pad, w: laneWidth, h: contentBottom + 14 - M.pad },
  }));

  return fit({ lanes, nodes: placed, edges }, M.pad * 2 + spec.lanes.length * laneWidth, contentBottom + 14 + M.pad);
}

/**
 * Grow the canvas to everything drawn — a gutter can reach past the outer
 * lanes — and shift the drawing right if a left gutter would be clipped.
 */
function fit(drawing: Omit<Layout, "width" | "height">, width: number, height: number): Layout {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const e of drawing.edges) {
    for (const p of e.points) {
      xs.push(p.x);
      ys.push(p.y);
    }
    if (e.label) xs.push(e.label.at.x - e.label.w / 2, e.label.at.x + e.label.w / 2);
  }
  const minX = Math.min(M.pad, ...xs);
  const shift = M.pad - minX;
  const maxX = Math.max(width - M.pad, ...xs) + shift;
  const maxY = Math.max(height - M.pad, ...ys);
  if (shift === 0) return { ...drawing, width: maxX + M.pad, height: maxY + M.pad };
  const move = (b: Box): Box => ({ ...b, x: b.x + shift });
  const moveP = (p: Point): Point => ({ ...p, x: p.x + shift });
  return {
    width: maxX + M.pad,
    height: maxY + M.pad,
    lanes: drawing.lanes.map((l) => ({ ...l, box: move(l.box) })),
    nodes: drawing.nodes.map((n) => shiftNode(n, shift)),
    edges: drawing.edges.map((e) => ({
      ...e,
      points: e.points.map(moveP),
      label: e.label ? { ...e.label, at: moveP(e.label.at) } : null,
    })),
  };
}

function shiftNode(node: PlacedNode, dx: number): PlacedNode {
  const box = { ...node.box, x: node.box.x + dx };
  switch (node.kind) {
    case "cell":
      return { ...node, box, bytes: node.bytes.map((b) => ({ ...b, box: { ...b.box, x: b.box.x + dx } })) };
    case "transaction": {
      const moveItem = (p: PlacedItem): PlacedItem => ({ ...p, box: { ...p.box, x: p.box.x + dx } });
      const c = node.columns;
      return {
        ...node,
        box,
        columns: { ...c, inputs: c.inputs.map(moveItem), outputs: c.outputs.map(moveItem), x: [c.x[0] + dx, c.x[1] + dx] },
      };
    }
    default:
      return { ...node, box };
  }
}
