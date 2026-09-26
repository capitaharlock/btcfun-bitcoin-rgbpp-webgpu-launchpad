/* What the app reads from CKB: cells and transactions, never more.
 *
 * The figures on a launch page and the verdicts on the proof page are only as
 * independent as the node behind this interface, which is why it is one: a
 * reader can point the app at a node they run, and a test can answer with a
 * handful of cells and no network. CCC's client is the adapter; its types
 * are used here because a cell or a transaction is CKB's own shape, not the
 * client's.
 */

import type { ccc } from "@ckb-ccc/core";

export interface CkbCells {
  /** A live cell, with its data, or null when it is spent or unknown. */
  liveCell(outPoint: ccc.OutPointLike): Promise<ccc.Cell | null>;
  /** A cell whether live or consumed — what a settled transaction's inputs were — or null when unknown. */
  cell(outPoint: ccc.OutPointLike): Promise<ccc.Cell | null>;
  /** Every live cell of a type script, with data. */
  cellsByType(type: ccc.ScriptLike): AsyncIterable<ccc.Cell>;
  /** A transaction by hash, or null when the node does not know it. */
  transaction(hash: ccc.HexLike): Promise<ccc.Transaction | null>;
}
