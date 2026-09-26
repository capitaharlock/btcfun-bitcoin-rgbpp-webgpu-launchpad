/* Ports and routes: which side of a node an edge leaves and enters, the
 * orthogonal polyline between them, where its label sits, and the nested
 * gutters that keep same-side routes from drawing over each other. */

import type { Side } from "../model";
import { METRICS as M, type Box, type PlacedItem, type PlacedNode, type Point, type Port } from "./types";

function sidePoint(box: Box, side: Side): Point {
  switch (side) {
    case "top":
      return { x: box.x + box.w / 2, y: box.y };
    case "bottom":
      return { x: box.x + box.w / 2, y: box.y + box.h };
    case "left":
      return { x: box.x, y: box.y + box.h / 2 };
    case "right":
      return { x: box.x + box.w, y: box.y + box.h / 2 };
  }
}

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export interface Resolved {
  node: PlacedNode;
  /** The item's box when the endpoint names a transaction item. */
  item: PlacedItem | null;
  /** Whether the item is an output, which decides its natural side. */
  output: boolean;
}

export function resolve(nodes: Map<string, PlacedNode>, endpoint: string): Resolved {
  const [nodeId, itemId] = endpoint.split(".");
  const node = nodes.get(nodeId);
  if (!node) throw new Error(`diagram edge names an unknown node: ${nodeId}`);
  if (itemId === undefined) return { node, item: null, output: false };
  if (node.kind !== "transaction") throw new Error(`only a transaction has items: ${endpoint}`);
  const input = node.columns.inputs.find((p) => p.item.id === itemId);
  const output = node.columns.outputs.find((p) => p.item.id === itemId);
  if (!input && !output) throw new Error(`diagram edge names an unknown item: ${endpoint}`);
  return { node, item: (input ?? output)!, output: !input };
}

/** The sides an edge uses when the declaration does not say. */
export function defaultSides(from: Box, to: Box, fromIsDecision: boolean): [Side, Side] {
  const a = centre(from);
  const b = centre(to);
  const sameColumn = Math.abs(a.x - b.x) < 1;
  const sameRow = Math.abs(a.y - b.y) < 1;
  if (sameRow) return b.x > a.x ? ["right", "left"] : ["left", "right"];
  if (b.y > a.y) {
    if (sameColumn) return ["bottom", "top"];
    // A decision branches sideways, so its "yes" can go straight down.
    if (fromIsDecision) return [b.x > a.x ? "right" : "left", "top"];
    return ["bottom", "top"];
  }
  // Back edges return through a gutter on the right.
  return ["right", "right"];
}

/** A transaction's header is where a line to the whole transaction lands, clear of its items. */
const TX_SIDE_Y = 17;

export function port(end: Resolved, side: Side): Port {
  if (end.item) return { ...sidePoint(end.item.box, side), side, owner: end.node.box };
  const box = end.node.box;
  if (end.node.kind === "transaction" && (side === "left" || side === "right")) {
    return { x: side === "left" ? box.x : box.x + box.w, y: box.y + TX_SIDE_Y, side, owner: box };
  }
  return { ...sidePoint(box, side), side, owner: box };
}

/**
 * An orthogonal polyline from `a` to `b`. `gutter` is where a same-side route
 * runs; other routes ignore it.
 */
export function route(a: Port, b: Port, gutter: number): Point[] {
  const horizontal = (s: Side) => s === "left" || s === "right";
  let points: Point[];
  if (a.side === b.side) {
    points = horizontal(a.side)
      ? [a, { x: gutter, y: a.y }, { x: gutter, y: b.y }, b]
      : [a, { x: a.x, y: gutter }, { x: b.x, y: gutter }, b];
  } else if (horizontal(a.side) && horizontal(b.side)) {
    const m = (a.x + b.x) / 2;
    points = [a, { x: m, y: a.y }, { x: m, y: b.y }, b];
  } else if (!horizontal(a.side) && !horizontal(b.side)) {
    const m = (a.y + b.y) / 2;
    points = [a, { x: a.x, y: m }, { x: b.x, y: m }, b];
  } else if (horizontal(a.side)) {
    points = [a, { x: b.x, y: a.y }, b];
  } else {
    points = [a, { x: a.x, y: b.y }, b];
  }
  return simplify(points);
}

/** Drop repeated and collinear points, so every remaining point is a real bend. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      const collinear =
        (Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5) ||
        (Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5);
      if (collinear) out.pop();
    }
    out.push(p);
  }
  return out;
}

const length = (p: Point, q: Point) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);

/**
 * Where an edge's label sits. A decision's yes/no sits just past the diamond,
 * so it reads as the branch's name; any other label sits on the middle of the
 * longest segment, where it is least likely to meet another line.
 */
export function labelPoint(points: Point[], nearStart: boolean): Point {
  if (nearStart) {
    const [p, q] = points;
    const d = Math.min(24, length(p, q) / 2);
    return { x: p.x + Math.sign(q.x - p.x) * d, y: p.y + Math.sign(q.y - p.y) * d };
  }
  let best = 0;
  for (let i = 1; i < points.length - 1; i++) {
    if (length(points[i], points[i + 1]) > length(points[best], points[best + 1])) best = i;
  }
  const [p, q] = [points[best], points[best + 1]];
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

/** Sides for an edge that touches a transaction item: inputs on the left, outputs on the right. */
export function itemSides(from: Resolved, to: Resolved): [Side, Side] {
  const natural = (end: Resolved, other: Resolved): Side => {
    if (end.item) return end.output ? "right" : "left";
    return other.output ? "right" : "left";
  };
  return [natural(from, to), natural(to, from)];
}

/**
 * Gutter coordinate for each same-side route (NaN for the others). Routes on
 * one side are nested by vertical extent — the shortest innermost — so no two
 * gutter routes overlap or cross.
 */
export function assignGutters(ends: Array<{ a: Port; b: Port }>): number[] {
  const out = ends.map(() => Number.NaN);
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const group = ends
      .map((e, i) => ({ ...e, i }))
      .filter((e) => e.a.side === side && e.b.side === side)
      .sort((p, q) => extent(p) - extent(q));
    group.forEach((e, level) => {
      const offset = M.gutter + level * M.gutterStep;
      const { a, b } = e;
      switch (side) {
        case "right":
          out[e.i] = Math.max(a.owner.x + a.owner.w, b.owner.x + b.owner.w) + offset;
          break;
        case "left":
          out[e.i] = Math.min(a.owner.x, b.owner.x) - offset;
          break;
        case "bottom":
          out[e.i] = Math.max(a.owner.y + a.owner.h, b.owner.y + b.owner.h) + offset;
          break;
        case "top":
          out[e.i] = Math.min(a.owner.y, b.owner.y) - offset;
          break;
      }
    });
  }
  return out;
}

const extent = ({ a, b }: { a: Point; b: Point }) => Math.abs(a.y - b.y) + Math.abs(a.x - b.x);
