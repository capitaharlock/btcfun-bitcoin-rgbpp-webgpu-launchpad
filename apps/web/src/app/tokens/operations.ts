/* An operation this wallet sent, and where it stands.
 *
 * An RGB++ operation lands in stages, and each stage is shown as what it is:
 *
 *   sent      the Bitcoin transaction is broadcast; nothing is final
 *   queued    Bitcoin has confirmed it or is about to; the RGB++ queue holds the CKB side
 *   settled   the CKB transaction is committed; the cells exist
 *   failed    the queue gave up; the Bitcoin transaction still stands
 *
 * Operations are a convenience, not a record: the chain is re-read on every
 * poll and is what balances come from. They exist so a reload in the middle
 * of a mint does not forget it, and so the outputs of a transaction still
 * landing are not spent again as plain funding.
 */

import type { LoopOperation } from "@/domain/mining";
import type { QueueStatus } from "@/ports";

export type OperationKind = "open" | "ticket" | "arm" | "mint" | "transfer" | "list" | "buy" | "cancel";
export type OperationStage = "sent" | "queued" | "settled" | "failed";

export interface Operation {
  kind: OperationKind;
  /** Bitcoin txid: the operation's identity. */
  btcTxid: string;
  launchId: string;
  tokenId: string;
  stage: OperationStage;
  ckbTxHash: string | null;
  failure: string | null;
  /** What the operation moves, for display: atoms minted or sent, sats paid. */
  atoms?: string;
  sats?: number;
  /** A ticket's anchor, so mining can start before the ticket settles. */
  anchor?: number;
  /** A ticket that created its miner cell, paid: it is armed by a second transaction. */
  newCell?: boolean;
  /**
   * The signed transaction, kept for a ticket that creates its cell: arming
   * the cell carries it whole (`planArm`), and this saves fetching it back.
   */
  hex?: string;
  at: string;
}

// The mining loop reads operations through its own structural type
// (`domain/mining/loop.ts`); this is where the two are held to agree.
const _loopReadsOperations: LoopOperation = null as unknown as Operation;
void _loopReadsOperations;

/** What a caller states about an operation before it is sent; the rest is filled in by submitting it. */
export type OperationMeta = Pick<Operation, "kind" | "launchId" | "tokenId" | "atoms" | "sats" | "anchor" | "newCell">;

/** True while the operation's outputs are not plain funding yet. */
export function isLanding(op: Operation): boolean {
  return op.stage === "sent" || op.stage === "queued";
}

/** Bitcoin txids of operations still landing: their outputs are not plain funding yet. */
export function landingTxids(ops: readonly Operation[]): Set<string> {
  return new Set(ops.filter(isLanding).map((op) => op.btcTxid));
}

/** The operation as the queue now reports it. A sent operation the queue holds is `queued`. */
export function advanced(op: Operation, status: QueueStatus): Operation {
  const stage: OperationStage = status.state === "completed" ? "settled" : status.state === "failed" ? "failed" : "queued";
  return { ...op, stage, ckbTxHash: status.ckbTxHash, failure: status.failure };
}
