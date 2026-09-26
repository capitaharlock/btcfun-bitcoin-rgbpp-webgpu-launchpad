/* What the step of a mining round on screen signs, and what the wallet must hold for it.
 *
 * Pure, so the rule that protects a miner's money is tested rather than
 * trusted: before the ticket is signed the wallet must hold the whole round —
 * the ticket, its network fee, and the network fees still to come (the arming,
 * when there is one, and the mint). A ticket paid without the means to mint it
 * would be lost, so a short wallet signs nothing and is told how much is
 * missing. `app/hooks/useMiningLoop.ts` feeds it the live wallet and fee rate.
 */

import type { Utxo } from "@/domain/bitcoin";
import { ARM_SHAPE, fundingNeeded, mintShape, networkFee, plainFunding, shapeOf } from "@/domain/rgbpp";
import type { RgbppConfig } from "@/domain/rgbpp";
import type { LaunchTerms } from "@/domain/rgbpp";
import { planArm } from "@/domain/rgbpp";
import { planMint } from "@/domain/rgbpp";
import { planTicket } from "@/domain/rgbpp";
import { SEAL_SATS, type Paymaster, type Plan } from "@/domain/rgbpp";
import type { MinerCell } from "@/domain/rgbpp";
import type { TokenCell } from "@/domain/rgbpp";
import { NEW_CELL, REUSE, type Split } from "@/domain/protocol";

/**
 * The transaction the step on screen signs, with what it is built from so far.
 * `held` is the wallet's token cell of this launch, if any: the round's mint
 * merges into it, which changes the mint's shape — and so its fee — from the
 * first step on.
 */
export type SigningStep = { held: TokenCell | null } & (
  /** The ticket: re-arming `idle`, or creating the cell (through the paymaster) when it is null. */
  | { kind: "ticket"; idle: MinerCell | null; paymaster: Paymaster | null }
  /** The arming of a paid cell; `creating` is the ticket that created it, once read. */
  | { kind: "arm"; paid: MinerCell; creating: Uint8Array | null }
  /** The mint of the best nonce, once there is one. */
  | { kind: "mint"; miner: MinerCell; nonce: bigint | null; reward: bigint }
);

/** What signing the current step costs, and whether the wallet can pay for the rest of the round. */
export interface Costs {
  /** The ticket's split, for the ticket step; null for a step that pays only the network. */
  split: Split | null;
  /** What the paymaster asks beyond the ticket's budget for it, paid on top. */
  paymasterExtra: number;
  /** This transaction's network fee. */
  network: number;
  /** Network fees the round still has after this transaction: the arming, if any, and the mint. */
  later: number;
  /** Plain sats the wallet must hold before signing: this step and the fees still to come. */
  reserve: number;
  /** Confirmed plain sats: what an operation can be funded from now. */
  spendable: number;
  /** Plain sats still waiting for a block. */
  pending: number;
  short: boolean;
  feeRate: number;
}

/** A launch as a plan needs it: its terms and btc.fun's admission of it. */
export interface PlannedLaunch {
  terms: LaunchTerms;
  admission: Uint8Array;
}

/**
 * The plan for `step`, built exactly as it will be signed — or null while
 * something it needs has not arrived (the paymaster's fee, the creating
 * ticket, a nonce) or the tip is behind the opening block, when the step is
 * not offered and there is nothing to price.
 */
export function planFor(config: RgbppConfig, launch: PlannedLaunch, step: SigningStep, tip: number): Plan | null {
  try {
    switch (step.kind) {
      case "ticket":
        if (step.idle === null && !step.paymaster) return null;
        return planTicket(config, launch.terms, { idle: step.idle, paymaster: step.paymaster, tip });
      case "arm":
        return step.creating ? planArm(config, launch.terms, step.paid, step.creating, tip, launch.admission) : null;
      case "mint":
        if (step.nonce === null) return null;
        return planMint(config, launch.terms, { miner: step.miner, held: step.held, nonce: step.nonce, reward: step.reward });
    }
  } catch {
    return null;
  }
}

/** The wallet as the costs read it. */
export interface Funds {
  utxos: readonly Utxo[];
  /** Txids of this wallet's operations still landing: their change is not spendable yet. */
  landing: ReadonlySet<string>;
  feeRate: number;
}

/** What signing `plan` for `step` costs now, and what the rest of its round will. */
export function costsFor(plan: Plan, step: SigningStep, { utxos, landing, feeRate }: Funds): Costs {
  const spendable = plainFunding(utxos, landing).reduce((n, u) => n + u.value, 0);
  const pending = utxos.filter((u) => !u.confirmed && u.value !== SEAL_SATS).reduce((n, u) => n + u.value, 0);
  const network = networkFee(shapeOf(plan), feeRate);
  const mintLater = fundingNeeded(mintShape(step.held !== null), feeRate);
  const newCell = step.kind === "ticket" && step.idle === null;
  const later = step.kind === "ticket" ? (newCell ? fundingNeeded(ARM_SHAPE, feeRate) : 0) + mintLater : step.kind === "arm" ? mintLater : 0;
  const reserve = fundingNeeded(plan, feeRate) + later;
  const split = step.kind !== "ticket" ? null : newCell ? NEW_CELL : REUSE;
  const paymasterExtra = newCell && step.paymaster ? Math.max(0, step.paymaster.feeSats - NEW_CELL.paymaster) : 0;
  return { split, paymasterExtra, network, later, reserve, spendable, pending, short: spendable < reserve, feeRate };
}
