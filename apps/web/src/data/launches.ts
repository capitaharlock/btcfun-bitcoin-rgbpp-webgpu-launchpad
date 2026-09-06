/* Launch catalogue.
 *
 * The launches themselves are fixtures — nobody has committed a real one. Their
 * *position in time* is not. Each pins an opening height the first time it is
 * seen, and `elapsed` is measured from there against the live Bitcoin tip,
 * because the whole point of PROTOCOL.md §6 is that block height is the clock:
 * epochs close and the emission chart advances as the chain produces blocks,
 * not as a timer in the page ticks.
 *
 * Ticket prices are real satoshis on the active network, and the mining floor
 * is a real difficulty: paying one and clearing the other is what admits a
 * claim. Reserve, liabilities and address counts remain fixtures, labelled as
 * such wherever they are shown (§3), and are separate from the ledger's own
 * reserve, which is the sum of tickets actually paid.
 */

import { CANDIDATE, cumulative, type Schedule } from "../lib/emission";
import type { LaunchRules } from "../lib/ledger";

export type LaunchState = "committed" | "mining" | "closed" | "dormant";

/** Protocol and network tags bound into every challenge on this build. */
export const PROTOCOL_VERSION = "btcfun/0.1-prototype";

/** A launch as authored, before the chain tip places it in time. */
export interface LaunchSpec {
  id: string;
  symbol: string;
  name: string;
  blurb: string;
  state: LaunchState;
  /**
   * Blocks between `h0` and now. Negative for a launch that has not opened,
   * which is how `committed` is expressed without a hardcoded height.
   */
  blocksSinceOpen: number;
  /** Epoch length in blocks. Candidate parameter, see V4. */
  epochBlocks: number;
  /** Price of one ticket, in satoshis on the active network. */
  ticketSats: number;
  /** Leading zero bits a candidate must reach to be admitted. */
  minClz: number;
  /** Reserve balance shown on the card. Fixture. */
  reserve: bigint;
  /** Distinct addresses that have mined. Fixture, and not a count of people (§2). */
  addresses: number;
  schedule: Schedule;
  accent: string;
  /** Identity that committed this launch. Absent on the seeded fixtures. */
  createdBy?: string;
}

/** A launch placed in time against a known tip. */
export interface Launch extends LaunchSpec {
  /** Bitcoin height at which mining opens. */
  h0: number;
  /** Blocks elapsed since `h0`, floored at 0. */
  elapsed: number;
  /** Epoch currently open. */
  epoch: number;
  /** Outstanding redemption liability, token atoms. Derived fixture. */
  liabilities: bigint;
  /** True once the tip has passed `h0`. */
  open: boolean;
}

export const SPECS: LaunchSpec[] = [
  {
    id: "mesh",
    symbol: "MESH",
    name: "Meshwork",
    blurb: "Community token for a mesh-relay operators' group. Bandwidth contributed, not bought.",
    state: "mining",
    blocksSinceOpen: 1_640,
    epochBlocks: 6,
    ticketSats: 2_000,
    minClz: 24,
    reserve: 41_820_000_000n,
    addresses: 214,
    schedule: CANDIDATE,
    accent: "var(--amber)",
  },
  {
    id: "obsv",
    symbol: "OBSV",
    name: "Observatory",
    blurb: "Shared funding pool for an open telemetry dashboard. Every panel is public.",
    state: "mining",
    blocksSinceOpen: 212,
    epochBlocks: 6,
    ticketSats: 2_000,
    minClz: 24,
    reserve: 9_140_000_000n,
    addresses: 63,
    schedule: CANDIDATE,
    accent: "var(--cyan)",
  },
  {
    id: "forge",
    symbol: "FORGE",
    name: "Forge Collective",
    blurb: "Hardware hackers pooling fabrication time. Mint to book the laser cutter.",
    state: "mining",
    blocksSinceOpen: 48,
    epochBlocks: 6,
    ticketSats: 3_000,
    minClz: 24,
    reserve: 1_980_000_000n,
    addresses: 27,
    schedule: CANDIDATE,
    accent: "var(--magenta)",
  },
  {
    id: "quill",
    symbol: "QUILL",
    name: "Quill",
    blurb: "Writers' collective experimenting with mined membership instead of subscriptions.",
    state: "committed",
    blocksSinceOpen: -144,
    epochBlocks: 6,
    ticketSats: 1_500,
    minClz: 24,
    reserve: 0n,
    addresses: 0,
    schedule: CANDIDATE,
    accent: "var(--violet)",
  },
  {
    id: "tide",
    symbol: "TIDE",
    name: "Tidepool",
    blurb: "Coastal monitoring co-op. Sensors earn, readings stay open.",
    state: "committed",
    blocksSinceOpen: -22,
    epochBlocks: 6,
    ticketSats: 1_200,
    minClz: 24,
    reserve: 0n,
    addresses: 0,
    schedule: CANDIDATE,
    accent: "var(--mint)",
  },
  {
    id: "lumen",
    symbol: "LUMEN",
    name: "Lumen",
    blurb: "Street-photography zine. One epoch per issue, contributors mine their share.",
    state: "mining",
    blocksSinceOpen: 640,
    epochBlocks: 6,
    ticketSats: 2_500,
    minClz: 24,
    reserve: 17_400_000_000n,
    addresses: 128,
    schedule: CANDIDATE,
    accent: "var(--warn)",
  },
  {
    id: "cairn",
    symbol: "CAIRN",
    name: "Cairn",
    blurb: "Trail-maintenance crew. Closed its window with the allowance fully taken.",
    state: "closed",
    blocksSinceOpen: 4_300,
    epochBlocks: 6,
    ticketSats: 2_000,
    minClz: 24,
    reserve: 33_100_000_000n,
    addresses: 176,
    schedule: CANDIDATE,
    accent: "var(--ok)",
  },
  {
    id: "relic",
    symbol: "RELIC",
    name: "Relic",
    blurb: "Archive project. Turnout collapsed after the first week and most allowance expired.",
    state: "dormant",
    blocksSinceOpen: 9_900,
    epochBlocks: 6,
    ticketSats: 2_000,
    minClz: 24,
    reserve: 2_360_000_000n,
    addresses: 19,
    schedule: CANDIDATE,
    accent: "var(--ink-faint)",
  },
];

/**
 * Height used before the live tip has arrived.
 *
 * Only a placeholder so the first paint has coherent numbers; every screen
 * replaces it as soon as the provider answers.
 */
export const FALLBACK_TIP = 100_000;

const ORIGIN_KEY = "btcfun:origins:v1";

/**
 * The height a launch opened at, pinned on first sight.
 *
 * `blocksSinceOpen` describes a launch's age at the moment someone first
 * loads it; after that the height is fixed and `elapsed` grows with the chain.
 * Recomputing `h0 = tip - blocksSinceOpen` on every poll would instead hold
 * `elapsed` constant and freeze the epoch clock — the opposite of a schedule
 * driven by block height.
 *
 * Pinned in localStorage because a real launch's `h0` would be a committed
 * on-chain fact, and the demo has to behave as though it were one.
 */
export function originHeight(spec: LaunchSpec, tip: number): number {
  const fallback = tip - spec.blocksSinceOpen;
  try {
    const stored = JSON.parse(localStorage.getItem(ORIGIN_KEY) ?? "{}") as Record<string, number>;
    if (typeof stored[spec.id] === "number") return stored[spec.id];
    // Don't pin against the placeholder tip: wait for a real one.
    if (tip === FALLBACK_TIP) return fallback;
    stored[spec.id] = fallback;
    localStorage.setItem(ORIGIN_KEY, JSON.stringify(stored));
    return fallback;
  } catch {
    return fallback;
  }
}

export function resolve(spec: LaunchSpec, tip: number): Launch {
  const h0 = originHeight(spec, tip);
  const elapsed = Math.max(0, tip - h0);
  const scheduled = cumulative(spec.schedule, BigInt(elapsed));
  // Fixture assumption: a share of the scheduled ceiling was actually minted.
  const takeUp: Record<LaunchState, bigint> = {
    committed: 0n,
    mining: 62n,
    closed: 80n,
    dormant: 11n,
  };
  return {
    ...spec,
    h0,
    elapsed,
    epoch: Math.floor(elapsed / spec.epochBlocks),
    liabilities: (scheduled * takeUp[spec.state]) / 100n,
    open: tip >= h0,
  };
}

export function resolveAll(tip: number, extra: readonly LaunchSpec[] = []): Launch[] {
  return [...SPECS, ...extra].map((spec) => resolve(spec, tip));
}

export function getLaunch(
  id: string,
  tip: number,
  extra: readonly LaunchSpec[] = [],
): Launch | undefined {
  const spec = [...SPECS, ...extra].find((s) => s.id === id);
  return spec ? resolve(spec, tip) : undefined;
}

/** The rules a ledger validates this launch's records against. */
export function rulesFor(launch: Launch, network: string): LaunchRules {
  return {
    launch: launch.id,
    version: PROTOCOL_VERSION,
    network,
    schedule: launch.schedule,
    epochBlocks: launch.epochBlocks,
    minClz: launch.minClz,
    ticketSats: launch.ticketSats,
  };
}

export function stateTone(s: LaunchState): "amber" | "cyan" | "ok" | "warn" | undefined {
  switch (s) {
    case "mining": return "amber";
    case "committed": return "cyan";
    case "closed": return "ok";
    case "dormant": return undefined;
  }
}
