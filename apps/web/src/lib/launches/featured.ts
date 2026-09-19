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
  import.meta.env.VITE_PLATFORM_IDENTITY ?? "03ec3671678cae90154a526ee386565d91adf335d55b57ff11274e1b99692b2d4e";

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

/*
 * Where this site offers its miner.
 *
 * During the testnet showcase the platform opens mining on the featured launch
 * only, so everyone's tickets and hashes land in one place. It is a choice of
 * this site, not of the protocol: the mint script on CKB accepts a paid ticket
 * and a valid hash for any launch, and anyone can build those transactions.
 * The UI says so wherever it withholds the miner.
 */

/** Said on every MINE this site switches off. */
export const MINING_CLOSED_NOTE = `Mining on this testnet showcase is open on ${DEMO_SYMBOL}`;

/** True when this site offers new tickets on the launch. */
export function canMine(launch: { id: string; symbol: string; creator: string }, rule: FeatureRule = FEATURE_RULE): boolean {
  return isFeatured(launch, rule);
}

/**
 * What the miner panel offers on a launch.
 *
 *   open    the whole loop: open a cell, buy tickets, mine, mint;
 *   finish  mining is closed here, but this wallet already paid for a ticket
 *           (or has an operation landing), so it can still mine and mint that
 *           one — closing the showcase must never strand a paid ticket;
 *   closed  nothing to buy; the panel points at the launch that is open.
 */
export type MinerAccess = "open" | "finish" | "closed";

export function minerAccess(
  launch: { id: string; symbol: string; creator: string },
  holdsTicket: boolean,
  rule: FeatureRule = FEATURE_RULE,
): MinerAccess {
  if (canMine(launch, rule)) return "open";
  return holdsTicket ? "finish" : "closed";
}
