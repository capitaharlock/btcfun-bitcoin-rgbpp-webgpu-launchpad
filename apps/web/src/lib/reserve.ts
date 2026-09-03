/* Reserve accounting and the dilution counterexample — PROTOCOL.md §4.3.
 *
 * Task E1 asks for a *reproducible* failure of the original allocation rule.
 * This module is that reproduction, plus the backing-limited candidate that
 * PROTOCOL.md proposes as a replacement. Neither is an adopted design.
 *
 * Definitions follow §4.4: `R` is redeemable backing in the declared reserve
 * asset; `S` is outstanding redemption liability, not a loose "circulating
 * supply" metric.
 */

export type AllocationRule = "uncapped" | "backing-limited";

export interface EpochInput {
  /** Scheduled budget for the epoch, in token atoms. */
  budget: bigint;
  /** Tickets admitted this epoch. */
  tickets: number;
  /** Eligible new backing per ticket, in reserve atoms. */
  ticketBacking: bigint;
}

export interface EpochResult {
  index: number;
  tickets: number;
  budget: bigint;
  /** Tokens actually minted. */
  minted: bigint;
  /** Budget that expired unused (scheduled but not minted). */
  expired: bigint;
  newBacking: bigint;
  reserve: bigint;
  liabilities: bigint;
  /** Backing per token atom, scaled by 1e12 for display. */
  ratioScaled: bigint;
}

const RATIO_SCALE = 1_000_000_000_000n;

export function ratioScaled(reserve: bigint, liabilities: bigint): bigint {
  if (liabilities === 0n) return 0n;
  return (reserve * RATIO_SCALE) / liabilities;
}

/**
 * Run a sequence of epochs under one allocation rule.
 *
 * `uncapped` is the original rule: whenever anyone participates, the whole
 * scheduled budget is allocated. `backing-limited` applies the §4.3 candidate
 * cap `m <= floor(dR * S / R)`, which is the condition under which a pure
 * issuance step cannot reduce `R/S`.
 */
export function simulate(
  epochs: EpochInput[],
  rule: AllocationRule,
  seed: { reserve: bigint; liabilities: bigint },
): EpochResult[] {
  let R = seed.reserve;
  let S = seed.liabilities;
  const out: EpochResult[] = [];

  epochs.forEach((e, index) => {
    const newBacking = BigInt(e.tickets) * e.ticketBacking;
    let minted = 0n;

    if (e.tickets > 0) {
      if (rule === "uncapped" || R === 0n || S === 0n) {
        minted = e.budget;
      } else {
        const cap = (newBacking * S) / R;
        minted = e.budget < cap ? e.budget : cap;
      }
    }

    R += newBacking;
    S += minted;

    out.push({
      index,
      tickets: e.tickets,
      budget: e.budget,
      minted,
      expired: e.budget - minted,
      newBacking,
      reserve: R,
      liabilities: S,
      ratioScaled: ratioScaled(R, S),
    });
  });

  return out;
}

/**
 * Integer redemption payout — PROTOCOL.md §4.4.
 * `floor(q × R / S)` leaves bounded dust; it is not exact real-number
 * invariance, and the UI must not present it as one.
 */
export function redeem(q: bigint, R: bigint, S: bigint): { payout: bigint; R2: bigint; S2: bigint } {
  if (q <= 0n || S <= 0n || q > S) return { payout: 0n, R2: R, S2: S };
  const payout = (q * R) / S;
  return { payout, R2: R - payout, S2: S - q };
}

/** Does this result set ever reduce backing per token? */
export function firstDilution(rows: EpochResult[]): EpochResult | null {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].ratioScaled < rows[i - 1].ratioScaled) return rows[i];
  }
  return null;
}

export function formatRatio(scaled: bigint): string {
  const whole = scaled / RATIO_SCALE;
  const frac = (scaled % RATIO_SCALE).toString().padStart(12, "0").slice(0, 6);
  return `${whole}.${frac}`;
}
