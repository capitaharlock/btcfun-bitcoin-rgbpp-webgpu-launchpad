/* Diagrams as data.
 *
 * A diagram is declared, not drawn: lanes (one per actor or chain), nodes
 * placed on a lane and a row, and edges between nodes or between the items of
 * a transaction. `layout/` turns that into coordinates and orthogonal
 * routes; `Diagram.tsx` only paints what the layout decided. Keeping the
 * declaration free of pixels is what lets a diagram live in a diff next to
 * the code it describes, and what lets its geometry be unit-tested.
 *
 * The notation is the standard flowchart one: rounded terminals, rectangular
 * steps, diamond decisions. Two kinds are specific to this project, because
 * its circuits are made of them: a transaction (inputs on the left, outputs on
 * the right, in order) and a CKB cell (its fields, and its data byte by byte).
 */

/** Soft fills from the site's accents (`--dg-<tone>-*` in `tokens.css`). */
export type Tone = "amber" | "cyan" | "violet" | "mint" | "rose" | "sun" | "slate";

export type Side = "top" | "right" | "bottom" | "left";

export interface Lane {
  id: string;
  /** Shown as the lane's header; a diagram with one unlabelled lane has none. */
  label?: string;
  tone?: Tone;
}

/** One line of a transaction: an input spent or an output created. */
export interface TxItem {
  id: string;
  label: string;
  /** Right-aligned, monospace: an amount, an index, a size. */
  value?: string;
  /** A smaller second line under the label. */
  detail?: string;
  tone?: Tone;
}

/** A labelled run of bytes in a cell's data. */
export interface ByteField {
  label: string;
  bytes: number;
}

interface Placed {
  id: string;
  lane: string;
  /** Rows are laid out top to bottom, each as tall as its tallest node. */
  row: number;
  /** Lanes the node spans to the right of its own; 1 by default. */
  span?: number;
  tone?: Tone;
}

export type FlowNode =
  | (Placed & { kind: "terminal"; label: string })
  | (Placed & { kind: "process"; label: string; detail?: string })
  | (Placed & { kind: "decision"; label: string })
  | (Placed & { kind: "note"; label: string })
  | (Placed & {
      kind: "cell";
      label: string;
      fields: Array<{ key: string; value: string }>;
      bytes?: ByteField[];
    })
  | (Placed & { kind: "transaction"; label: string; inputs: TxItem[]; outputs: TxItem[] });

export type NodeKind = FlowNode["kind"];

/**
 * What an edge means, which decides how it is drawn.
 *   flow     the next step
 *   yes, no  the branches out of a decision, labelled by default
 *   seal     a CKB cell bound to a Bitcoin output (dashed)
 *   commit   an OP_RETURN committing to a CKB transaction (dashed)
 */
export type EdgeKind = "flow" | "yes" | "no" | "seal" | "commit";

/** A node by id, or one item of a transaction node as `node.item`. */
export type Endpoint = string;

export interface Edge {
  from: Endpoint;
  to: Endpoint;
  kind?: EdgeKind;
  label?: string;
  /** Which side of each end the line leaves or enters; chosen from geometry when omitted. */
  fromSide?: Side;
  toSide?: Side;
}

export interface DiagramSpec {
  /** Read by assistive technology as the image's name, and shown above it. */
  title: string;
  /** The whole diagram in words, for anyone who cannot see it. */
  description: string;
  lanes: Lane[];
  nodes: FlowNode[];
  edges: Edge[];
  /** Width of one lane; the default suits a four-lane flowchart. */
  laneWidth?: number;
}
