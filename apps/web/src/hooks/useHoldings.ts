/* What this wallet actually holds, across every launch.
 *
 * A portfolio is a read across every chain at once, which a per-launch hook
 * cannot answer without being called in a loop. `LocalLedger` and `replay` are
 * plain functions over storage, so the whole sweep is one memo — and it uses
 * the same replay every other screen does, rather than a cheaper approximation
 * that could disagree with the launch page about a balance.
 */

import { useMemo } from "react";

import { rulesFor, type Launch } from "../data/launches";
import { LocalLedger, replay, type LedgerState } from "../lib/ledger";
import { NETWORK } from "../state/WalletProvider";

export interface Position {
  launch: Launch;
  /** Atoms this identity holds on that chain. */
  held: bigint;
  /** Validated state, or null when the stored chain does not replay. */
  state: LedgerState | null;
  /** Why it does not replay, when it does not. */
  fault: string | null;
}

/**
 * Positions worth showing: a balance, or a history that produced one.
 *
 * A launch with an empty chain is omitted. Rendering a card per launch turned
 * the page into a wall of zeros, which is the opposite of what a portfolio is
 * for. A chain that fails to replay is *kept*, with its fault, because silently
 * dropping it would hide the one case the owner most needs to see.
 */
export function useHoldings(
  launches: readonly Launch[],
  identity: string | undefined,
  /** Bump after writing a chain, so the sweep re-reads storage. */
  revision = 0,
): Position[] {
  return useMemo(() => {
    if (!identity) return [];

    const positions: Position[] = [];
    for (const launch of launches) {
      const rules = rulesFor(launch, NETWORK.id);
      const ledger = new LocalLedger(rules);

      try {
        // Reading is inside the try: storage that holds something other than a
        // chain throws, and that is a position worth showing, not a zero.
        const records = ledger.records();
        if (records.length === 0) continue;

        const state = replay(records, rules);
        const held = state.balances.get(identity) ?? 0n;
        if (held === 0n && !touched(records, identity)) continue;
        positions.push({ launch, held, state, fault: null });
      } catch (err) {
        positions.push({
          launch,
          held: 0n,
          state: null,
          fault: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Largest position first; chains that failed to replay float to the top,
    // because a broken chain is more urgent than a small balance.
    return positions.sort((a, b) => {
      if (!a.state !== !b.state) return a.state ? 1 : -1;
      return a.held === b.held ? 0 : a.held > b.held ? -1 : 1;
    });
    // `revision` is the invalidation signal for the storage-backed sweep.
  }, [launches, identity, revision]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Did this identity ever author or receive anything on that chain? */
function touched(records: ReturnType<LocalLedger["records"]>, identity: string): boolean {
  return records.some(
    (r) => r.body.author === identity || (r.body.kind === "transfer" && r.body.to === identity),
  );
}
