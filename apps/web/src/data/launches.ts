/* Fixture launches.
 *
 * These are DETERMINISTIC FIXTURES, not chain data. Nothing in this prototype
 * talks to Bitcoin or CKB yet — that is Phase 1 (`V1`–`V10`). The UI labels
 * every screen accordingly, because PROTOCOL.md §3 requires invalid, incomplete
 * and stale evidence to be distinguishable from a valid proof.
 */

import { CANDIDATE, cumulative, type Schedule } from "../lib/emission";

export type LaunchState = "committed" | "mining" | "closed" | "dormant";

export interface Launch {
  id: string;
  symbol: string;
  name: string;
  blurb: string;
  state: LaunchState;
  /** Bitcoin height at which mining opens. */
  h0: number;
  /** Blocks elapsed since h0 (0 when still committed). */
  elapsed: number;
  /** Epoch length in blocks. Candidate parameter, see V4. */
  epochBlocks: number;
  /** Reserve balance in reserve-asset atoms. */
  reserve: bigint;
  /** Outstanding redemption liability, token atoms. */
  liabilities: bigint;
  /** Distinct addresses that have mined. Not a count of people (§2). */
  addresses: number;
  /** Ticket price in reserve-asset atoms. */
  ticketPrice: bigint;
  schedule: Schedule;
  accent: string;
}

export const CURRENT_HEIGHT = 918_412;

export const LAUNCHES: Launch[] = [
  {
    id: "mesh",
    symbol: "MESH",
    name: "Meshwork",
    blurb: "Community token for a mesh-relay operators' group.",
    state: "mining",
    h0: CURRENT_HEIGHT - 1_640,
    elapsed: 1_640,
    epochBlocks: 6,
    reserve: 41_820_000_000n,
    liabilities: 0n,
    addresses: 214,
    ticketPrice: 20_000_000n,
    schedule: CANDIDATE,
    accent: "var(--amber)",
  },
  {
    id: "obsv",
    symbol: "OBSV",
    name: "Observatory",
    blurb: "Shared funding pool for an open telemetry dashboard.",
    state: "mining",
    h0: CURRENT_HEIGHT - 212,
    elapsed: 212,
    epochBlocks: 6,
    reserve: 9_140_000_000n,
    liabilities: 0n,
    addresses: 63,
    ticketPrice: 20_000_000n,
    schedule: CANDIDATE,
    accent: "var(--cyan)",
  },
  {
    id: "quill",
    symbol: "QUILL",
    name: "Quill",
    blurb: "Writers' collective experimenting with mined membership.",
    state: "committed",
    h0: CURRENT_HEIGHT + 144,
    elapsed: 0,
    epochBlocks: 6,
    reserve: 0n,
    liabilities: 0n,
    addresses: 0,
    ticketPrice: 15_000_000n,
    schedule: CANDIDATE,
    accent: "var(--violet)",
  },
  {
    id: "relic",
    symbol: "RELIC",
    name: "Relic",
    blurb: "Archive project. Turnout collapsed after the first week.",
    state: "dormant",
    h0: CURRENT_HEIGHT - 9_900,
    elapsed: 9_900,
    epochBlocks: 6,
    reserve: 2_360_000_000n,
    liabilities: 0n,
    addresses: 19,
    ticketPrice: 20_000_000n,
    schedule: CANDIDATE,
    accent: "var(--ink-faint)",
  },
];

/** Liabilities are derived from the schedule so fixtures stay self-consistent. */
function withDerived(l: Launch): Launch {
  const scheduled = cumulative(l.schedule, BigInt(l.elapsed));
  // Fixture assumption: a share of the scheduled ceiling was actually minted.
  const takeUp: Record<LaunchState, bigint> = {
    committed: 0n,
    mining: 62n,
    closed: 80n,
    dormant: 11n,
  };
  return { ...l, liabilities: (scheduled * takeUp[l.state]) / 100n };
}

export const launches: Launch[] = LAUNCHES.map(withDerived);

export function getLaunch(id: string): Launch | undefined {
  return launches.find((l) => l.id === id);
}

export function stateTone(s: LaunchState): "amber" | "cyan" | "ok" | "warn" | undefined {
  switch (s) {
    case "mining": return "amber";
    case "committed": return "cyan";
    case "closed": return "ok";
    case "dormant": return undefined;
  }
}
