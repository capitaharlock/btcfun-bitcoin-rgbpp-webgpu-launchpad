/* Launches placed against the live chain tip.
 *
 * Thin readers over `LaunchesProvider`, which owns the merge of fixtures,
 * locally created launches and launches seen through the index. Every view
 * needs the same resolution — a launch's age and current epoch are functions of
 * the tip — so it happens once rather than in each of them.
 */

import { useEffect, useMemo, useState } from "react";

import { getLaunch, resolveAll, rulesFor, type Launch } from "../data/launches";
import { useLaunchRegistry } from "../state/LaunchesProvider";
import { NETWORK } from "../state/WalletProvider";
import { getBlockHash } from "../lib/bitcoin";
import type { LaunchRules } from "../lib/ledger";

/** Current Bitcoin height, or the placeholder until the provider answers. */
export function useTip(): number {
  return useLaunchRegistry().tip;
}

/** Whether the chain tip is real yet, or still the placeholder used for first paint. */
export function useChainSynced(): boolean {
  return useLaunchRegistry().synced;
}

export function useLaunches(): Launch[] {
  const { tip, extra } = useLaunchRegistry();
  return useMemo(() => resolveAll(tip, extra), [tip, extra]);
}

export function useLaunch(id: string): Launch | undefined {
  const { tip, extra } = useLaunchRegistry();
  return useMemo(() => getLaunch(id, tip, extra), [id, tip, extra]);
}

/**
 * Ledger rules for a launch.
 *
 * Takes a definite `Launch`, so callers resolve the launch first and only then
 * derive rules — which keeps the "not found" branch out of every component that
 * needs them and removes the non-null assertions that branch would otherwise
 * force. A record's validity must not depend on the clock, and none of these
 * fields do.
 */
export function useLaunchRules(launch: Launch): LaunchRules {
  return useMemo(() => rulesFor(launch, NETWORK.id), [launch]);
}

/** First retry for a block hash the provider has not indexed yet, doubling to the cap. */
const HASH_RETRY_MS = 3_000;
const HASH_RETRY_CAP_MS = 30_000;

/**
 * Hash of the Bitcoin block that opened a launch's current epoch.
 *
 * Every claim binds to it (PROTOCOL.md §4.2), which is what ties an epoch's
 * work to a point on the chain rather than to a timestamp this page chose.
 * Null until the provider answers; a claim cannot be signed before then.
 *
 * Retried until it arrives. The moment an epoch opens is exactly when its
 * block is newest, and a provider commonly reports the new tip a few seconds
 * before it can serve that block by height. Asking once and giving up left a
 * buyer who had just paid for a ticket unable to mine for the whole epoch.
 */
export function useEpochBlockHash(launch: Launch | undefined): string | null {
  const [hash, setHash] = useState<string | null>(null);
  const height = launch ? launch.h0 + launch.epoch * launch.epochBlocks : null;

  useEffect(() => {
    setHash(null);
    if (height === null) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = (delay: number) => {
      getBlockHash(height).then(
        (value) => live && setHash(value),
        () => {
          if (!live) return;
          timer = setTimeout(() => attempt(Math.min(delay * 2, HASH_RETRY_CAP_MS)), delay);
        },
      );
    };
    attempt(HASH_RETRY_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [height]);

  return hash;
}
