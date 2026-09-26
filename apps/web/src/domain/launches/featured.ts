/* The launch a newcomer should mine first.
 *
 * The catalogue is permissionless and ordered by what the public feed says,
 * so featuring is the one place the platform speaks for itself, and it is
 * narrow on purpose: a launch is featured only when its id is listed here, or
 * when it is the platform's own DEMO launch. "The platform's own" means the
 * announcer is the platform's identity — and the announcer of a launch is its
 * first announcer (`registry.ts`), so nobody can feature a launch by copying
 * an announcement or picking the same symbol.
 */

import { env } from "@/config/env";

/** Launch ids featured by hand. Empty until the platform announces one. */
export const FEATURED_LAUNCH_IDS: readonly string[] = [];

/** The symbol of the platform's demonstration launch. */
export const DEMO_SYMBOL = "DEMO";

/**
 * The identity that publishes the platform's official launches (the seed
 * wallet, `scripts/rgbpp/seed.mjs`). Build configuration like the service
 * endpoints, so a test build can name a key of its own.
 */
export const PLATFORM_IDENTITY: string =
  env("VITE_PLATFORM_IDENTITY") ?? "03ec3671678cae90154a526ee386565d91adf335d55b57ff11274e1b99692b2d4e";

export interface FeatureRule {
  ids: readonly string[];
  symbol: string;
  platform: string;
}

export const FEATURE_RULE: FeatureRule = { ids: FEATURED_LAUNCH_IDS, symbol: DEMO_SYMBOL, platform: PLATFORM_IDENTITY };

/** True for a launch the catalogue should put first. `creator` must be the first announcer. */
export function isFeatured(launch: { id: string; symbol: string; creator: string }, rule: FeatureRule = FEATURE_RULE): boolean {
  return rule.ids.includes(launch.id) || (launch.symbol === rule.symbol && launch.creator === rule.platform);
}

/** The platform's pick among several featured launches: the newest announcement. */
export function featuredLaunch<L extends { id: string; symbol: string; creator: string; announcedAt: string }>(
  launches: readonly L[],
  rule: FeatureRule = FEATURE_RULE,
): L | undefined {
  let pick: L | undefined;
  for (const l of launches) {
    if (isFeatured(l, rule) && (!pick || l.announcedAt > pick.announcedAt)) pick = l;
  }
  return pick;
}
