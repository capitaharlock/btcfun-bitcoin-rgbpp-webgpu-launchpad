/* Launches placed against the live chain tip.
 *
 * Thin readers over `LaunchesProvider`. A launch's phase and current rate are
 * functions of the tip, so the resolution happens here once rather than in
 * every view.
 */

import { useMemo } from "react";

import { resolve, type Launch } from "@/domain/launches";
import { useLaunchRegistry } from "@/app/providers/LaunchesProvider";

/** Current Bitcoin height, or the placeholder until the provider answers. */
export function useTip(): number {
  return useLaunchRegistry().tip;
}

/** Whether the chain tip is real yet, or still the placeholder used for first paint. */
export function useChainSynced(): boolean {
  return useLaunchRegistry().synced;
}

export function useLaunches(): Launch[] {
  const { tip, specs } = useLaunchRegistry();
  return useMemo(() => specs.map((spec) => resolve(spec, tip)), [tip, specs]);
}

export function useLaunch(id: string): Launch | undefined {
  const { tip, specs } = useLaunchRegistry();
  return useMemo(() => {
    const spec = specs.find((s) => s.id === id);
    return spec ? resolve(spec, tip) : undefined;
  }, [id, tip, specs]);
}

/** The launch whose token has this xUDT type hash, if this app knows it. */
export function useLaunchByToken(): (tokenId: string) => Launch | undefined {
  const launches = useLaunches();
  return useMemo(() => {
    const byToken = new Map(launches.map((l) => [l.tokenId, l]));
    return (tokenId: string) => byToken.get(tokenId);
  }, [launches]);
}
