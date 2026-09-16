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
 */

import type { ByteField, DiagramSpec, EdgeKind, FlowNode, Lane, Side, Tone, TxItem } from "./model";
import { textWidth, widest, wrap } from "./text";

export const METRICS = {
  pad: 24,
  laneWidth: 212,
  laneHeader: 46,
  rowGap: 46,
  font: 13,
  line: 17,
  detailFont: 11.5,
  detailLine: 15,
  labelFont: 11.5,
  labelHeight: 20,
  gutter: 18,
  gutterStep: 14,
} as const;

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedItem {
  item: TxItem;
  box: Box;
  lines: string[];
  detail: string[];
}

export interface PlacedByte extends ByteField {
  box: Box;
}

interface PlacedBase {
  id: string;
  tone: Tone;
  box: Box;
}

export type PlacedNode =
  | (PlacedBase & { kind: "terminal" | "decision" | "note"; lines: string[] })
  | (PlacedBase & { kind: "process"; lines: string[]; detail: string[] })
  | (PlacedBase & {
      kind: "cell";
      title: string;
      fields: Array<{ key: string; value: string[]; y: number }>;
      bytes: PlacedByte[];
    })
  | (PlacedBase & {
      kind: "transaction";
      title: string;
      columns: { inputs: PlacedItem[]; outputs: PlacedItem[]; headerY: number; x: [number, number]; w: number };
    });

export interface PlacedEdge {
  kind: EdgeKind;
  points: Point[];
  label: { text: string; at: Point; w: number } | null;
}

export interface PlacedLane extends Lane {
  box: Box;
  tone: Tone;
}

export interface Layout {
  width: number;
  height: number;
  lanes: PlacedLane[];
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

const M = METRICS;

/* ---------- node sizing ---------- */

interface Sized {
  node: FlowNode;
  w: number;
  h: number;
  /** Builds the placed node once the top-left corner is known. */
  place(x: number, y: number): PlacedNode;
}

const ITEM_GAP = 6;
const TX_HEAD = 34;
const COL_HEAD = 22;
const TX_PAD = 12;
const CELL_HEAD = 30;
const FIELD_KEY = 58;
const BYTE_STRIP = 40;

function sizeItems(items: TxItem[], width: number): Array<{ item: TxItem; lines: string[]; detail: string[]; h: number }> {
  return items.map((item) => {
    const valueW = item.value ? textWidth(item.value, M.detailFont, true) + 10 : 0;
    const lines = wrap(item.label, width - 20 - valueW, 12.5);
    const detail = item.detail ? wrap(item.detail, width - 20, 11) : [];
    const h = 9 + lines.length * 16 + detail.length * 14 + 8;
    return { item, lines, detail, h: Math.max(32, h) };
  });
}

function size(node: FlowNode, laneWidth: number): Sized {
  const room = laneWidth * (node.span ?? 1);
  const tone = node.tone ?? defaultTone(node.kind);
  switch (node.kind) {
    case "terminal": {
      const max = room - 40;
      const lines = wrap(node.label, max - 40, M.font);
      const w = Math.min(max, Math.max(124, widest(lines, M.font) + 44));
      const h = Math.max(40, lines.length * M.line + 20);
      return { node, w, h, place: (x, y) => ({ id: node.id, kind: "terminal", tone, box: { x, y, w, h }, lines }) };
    }
    case "process": {
      const w = room - 40;
      const lines = wrap(node.label, w - 28, M.font);
      const detail = node.detail ? wrap(node.detail, w - 28, M.detailFont) : [];
      const h = 15 + lines.length * M.line + (detail.length ? 4 + detail.length * M.detailLine : 0) + 13;
      return { node, w, h, place: (x, y) => ({ id: node.id, kind: "process", tone, box: { x, y, w, h }, lines, detail }) };
    }
    case "decision": {
      const w = room - 28;
      const lines = wrap(node.label, w * 0.5, M.font);
      // The text block must sit inside the diamond: a corner (tx, ty) of it
      // satisfies tx / (w/2) + ty / (h/2) ≤ 1.
      const tx = widest(lines, M.font) / 2 + 4;
      const ty = (lines.length * M.line) / 2 + 4;
      const h = Math.max(72, Math.ceil((2 * ty) / (1 - (2 * tx) / w)) + 6);
      return { node, w, h, place: (x, y) => ({ id: node.id, kind: "decision", tone, box: { x, y, w, h }, lines }) };
    }
    case "note": {
      const w = room - 40;
      const lines = wrap(node.label, w - 30, 12);
      const h = 14 + lines.length * 16 + 12;
      return { node, w, h, place: (x, y) => ({ id: node.id, kind: "note", tone, box: { x, y, w, h }, lines }) };
    }
    case "cell": {
      const w = room - 40;
      const fields = node.fields.map((f) => ({ key: f.key, value: wrap(f.value, w - 24 - FIELD_KEY, 11.5, true) }));
      const fieldsH = fields.reduce((n, f) => n + f.value.length * 15 + 3, 0);
      const bytesH = node.bytes?.length ? 10 + BYTE_STRIP : 0;
      const h = CELL_HEAD + 10 + fieldsH + bytesH + 10;
      return {
        node,
        w,
        h,
        place: (x, y) => {
          let cursor = y + CELL_HEAD + 10;
          const placedFields = fields.map((f) => {
            const at = cursor;
            cursor += f.value.length * 15 + 3;
            return { ...f, y: at };
          });
          return {
            id: node.id,
            kind: "cell",
            tone,
            box: { x, y, w, h },
            title: node.label,
            fields: placedFields,
            bytes: node.bytes ? placeBytes(node.bytes, { x: x + 12, y: cursor + 10, w: w - 24, h: BYTE_STRIP - 8 }) : [],
          };
        },
      };
    }
    case "transaction": {
      const w = room - 32;
      const colW = (w - TX_PAD * 3) / 2;
      const inputs = sizeItems(node.inputs, colW);
      const outputs = sizeItems(node.outputs, colW);
      const colH = (col: typeof inputs) => col.reduce((n, c) => n + c.h + ITEM_GAP, 0) - (col.length ? ITEM_GAP : 0);
      const h = TX_HEAD + 10 + COL_HEAD + Math.max(colH(inputs), colH(outputs)) + TX_PAD;
      return {
        node,
        w,
        h,
        place: (x, y) => {
          const columnX: [number, number] = [x + TX_PAD, x + TX_PAD * 2 + colW];
          const top = y + TX_HEAD + 10 + COL_HEAD;
          const stack = (col: typeof inputs, cx: number): PlacedItem[] => {
            let cursor = top;
            return col.map((c) => {
              const box = { x: cx, y: cursor, w: colW, h: c.h };
              cursor += c.h + ITEM_GAP;
              return { item: c.item, box, lines: c.lines, detail: c.detail };
            });
          };
          return {
            id: node.id,
            kind: "transaction",
            tone,
            box: { x, y, w, h },
            title: node.label,
            columns: {
              inputs: stack(inputs, columnX[0]),
              outputs: stack(outputs, columnX[1]),
              headerY: y + TX_HEAD + 10,
              x: columnX,
              w: colW,
            },
          };
        },
      };
    }
  }
}

/** Byte fields share the strip in proportion to their size, with a floor so a 1-byte field stays labelled. */
export function placeBytes(fields: ByteField[], strip: Box): PlacedByte[] {
  const floor = 52;
  const total = fields.reduce((n, f) => n + f.bytes, 0);
  const flexible = strip.w - floor * fields.length;
  let x = strip.x;
  return fields.map((f) => {
    const w = floor + (flexible * f.bytes) / total;
    const placed = { ...f, box: { x, y: strip.y, w, h: strip.h } };
    x += w;
    return placed;
  });
}

function defaultTone(kind: FlowNode["kind"]): Tone {
  switch (kind) {
    case "decision":
    case "note":
      return "sun";
    case "terminal":
      return "slate";
    default:
      return "violet";
  }
}

/* ---------- ports and routes ---------- */

export interface Port extends Point {
  side: Side;
  /** The box the line must clear: the whole node, even when the port is an item. */
  owner: Box;
}

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

interface Resolved {
  node: PlacedNode;
  /** The item's box when the endpoint names a transaction item. */
  item: PlacedItem | null;
  /** Whether the item is an output, which decides its natural side. */
  output: boolean;
}

function resolve(nodes: Map<string, PlacedNode>, endpoint: string): Resolved {
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

function port(end: Resolved, side: Side): Port {
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

/* ---------- the whole diagram ---------- */

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

/** Sides for an edge that touches a transaction item: inputs on the left, outputs on the right. */
function itemSides(from: Resolved, to: Resolved): [Side, Side] {
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

