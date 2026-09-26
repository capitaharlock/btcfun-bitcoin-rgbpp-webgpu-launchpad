/* Node sizing: how big each kind of node is in its lane, and where its inner
 * parts — text lines, cell fields, byte strips, transaction items — land once
 * the node's corner is known. Text is measured without a DOM (`../text`). */

import type { ByteField, FlowNode, Tone, TxItem } from "../model";
import { textWidth, widest, wrap } from "../text";
import { METRICS as M, type Box, type PlacedByte, type PlacedItem, type PlacedNode } from "./types";

export interface Sized {
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

export function size(node: FlowNode, laneWidth: number): Sized {
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
