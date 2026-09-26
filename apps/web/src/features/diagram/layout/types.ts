/* The diagram layout's vocabulary: the metrics every stage shares and the
 * placed shapes the layout hands the renderer. Kept apart so sizing, routing
 * and the whole-diagram pass depend on these, not on each other. */

import type { ByteField, EdgeKind, Lane, Side, Tone, TxItem } from "../model";

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

export interface Port extends Point {
  side: Side;
  /** The box the line must clear: the whole node, even when the port is an item. */
  owner: Box;
}
