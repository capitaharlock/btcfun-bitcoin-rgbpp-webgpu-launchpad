/* Launches placed against the live chain tip.
 *
 * Every view needs the same resolution — a launch's age and current epoch are
 * functions of the tip — so it happens once here rather than in each of them.
 * Until the provider has a tip the placeholder is used, which keeps the first
 * paint coherent instead of rendering dashes.
 */

import { useEffect, useMemo, useState } from "react";

import { FALLBACK_TIP, getLaunch, resolveAll, rulesFor, type Launch } from "../data/launches";
import { NETWORK, useWallet } from "../state/WalletProvider";
import { getBlockHash } from "../lib/bitcoin";
import type { LaunchRules } from "../lib/ledger";

/** Current Bitcoin height, or the placeholder until the provider answers. */
export function useTip(): number {
  return useWallet().tipHeight ?? FALLBACK_TIP;
}

export function useLaunches(): Launch[] {
  const tip = useTip();
  return useMemo(() => resolveAll(tip), [tip]);
}

export function useLaunch(id: string): Launch | undefined {
  const tip = useTip();
  return useMemo(() => getLaunch(id, tip), [id, tip]);
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

/**
 * Hash of the Bitcoin block that opened a launch's current epoch.
 *
 * Every claim binds to it (PROTOCOL.md §4.2), which is what ties an epoch's
 * work to a point on the chain rather than to a timestamp this page chose.
 * Null until the provider answers; a claim cannot be signed before then.
 */
export function useEpochBlockHash(launch: Launch | undefined): string | null {
  const [hash, setHash] = useState<string | null>(null);
  const height = launch ? launch.h0 + launch.epoch * launch.epochBlocks : null;

  useEffect(() => {
    if (height === null) return;
    let live = true;
    getBlockHash(height).then(
      (value) => live && setHash(value),
      // A missing block hash disables claiming and says so; it is not fatal to
      // the page, and the next epoch will ask for a different height anyway.
      () => live && setHash(null),
    );
    return () => {
      live = false;
    };
  }, [height]);

  return hash;
}
