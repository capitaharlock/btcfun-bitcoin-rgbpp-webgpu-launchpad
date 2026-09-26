/* What a wallet holds, per token, as the pages show it.
 *
 * Pure folds over the cells the chain reports and the operations this browser
 * sent, kept apart from the components so the rule that matters — a mint still
 * landing is shown beside the balance, never added to it — is unit-tested.
 * The inputs are structural so this layer needs nothing from the providers.
 */

import type { TokenCell } from "./cells/token";

export interface Position {
  tokenId: string;
  cells: TokenCell[];
  total: bigint;
}

/** Every token held, largest balance first. */
export function positionsOf(holdings: { tokens: ReadonlyMap<string, TokenCell[]> }): Position[] {
  return [...holdings.tokens.entries()]
    .map(([tokenId, cells]) => ({ tokenId, cells, total: cells.reduce((n, c) => n + c.amount, 0n) }))
    .sort((a, b) => (a.total === b.total ? 0 : a.total > b.total ? -1 : 1));
}

/** The fields of a sent operation that say whether it is a mint still landing. */
export interface LandingCandidate {
  kind: string;
  tokenId: string;
  stage: string;
  atoms?: string;
}

/**
 * Tokens minted from this browser whose Bitcoin transaction is sent but not
 * settled, by token. They are shown as landing, never added to the balance:
 * the balance is what the chain holds.
 */
export function landingMints(operations: readonly LandingCandidate[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const op of operations) {
    if (op.kind !== "mint" || !op.atoms || (op.stage !== "sent" && op.stage !== "queued")) continue;
    out.set(op.tokenId, (out.get(op.tokenId) ?? 0n) + BigInt(op.atoms));
  }
  return out;
}
