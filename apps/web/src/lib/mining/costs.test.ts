import { describe, expect, it } from "vitest";

import { ADMISSION, creating, miner, minerCap, paid, paymaster, sealed, terms, tokenCap } from "../../test/rgbpp";
import type { Utxo } from "../bitcoin/provider";
import { ARM_SHAPE, fundingNeeded, mintShape, networkFee, shapeOf } from "../rgbpp/bitcoin";
import { TESTNET } from "../rgbpp/config";
import { SEAL_SATS, type TokenCell } from "../rgbpp/operations";
import { NEW_CELL, REUSE } from "../standard";
import { costsFor, planFor, type SigningStep } from "./costs";

const launch = { terms, admission: ADMISSION };
const FEE_RATE = 2;
const coin = (value: number, n: number, confirmed = true): Utxo => ({ txid: String(n).padStart(64, "5"), vout: 0, value, confirmed });
const held: TokenCell = { ...sealed(2, tokenCap), amount: 1_000n };

describe("the plan a step signs", () => {
  it("waits for what it needs instead of guessing", () => {
    expect(planFor(TESTNET, launch, { kind: "ticket", idle: null, paymaster: null, held: null }, terms.h0)).toBeNull();
    expect(planFor(TESTNET, launch, { kind: "arm", paid: paid(), creating: null, held: null }, terms.h0)).toBeNull();
    expect(planFor(TESTNET, launch, { kind: "mint", miner: miner("armed", minerCap), nonce: null, reward: 1n, held: null }, terms.h0)).toBeNull();
  });

  it("offers nothing before the opening block", () => {
    expect(planFor(TESTNET, launch, { kind: "ticket", idle: null, paymaster, held: null }, terms.h0 - 1)).toBeNull();
  });

  it("builds each step once it has what it needs", () => {
    expect(planFor(TESTNET, launch, { kind: "ticket", idle: null, paymaster, held: null }, terms.h0)?.needPaymasterCell).toBe(true);
    expect(planFor(TESTNET, launch, { kind: "arm", paid: paid(), creating, held: null }, terms.h0)?.sealsSpent).toEqual([paid().seal]);
    const mint = planFor(TESTNET, launch, { kind: "mint", miner: miner("armed", minerCap), nonce: 7n, reward: 5n, held }, terms.h0);
    expect(mint?.sealsSpent).toHaveLength(2);
  });
});

describe("what a step costs", () => {
  const utxos = [coin(50_000, 1), coin(3_000, 2, false), { ...coin(SEAL_SATS, 3, false) }, coin(9_000, 4)];
  const funds = { utxos, landing: new Set([coin(9_000, 4).txid]), feeRate: FEE_RATE };
  const costOf = (step: SigningStep) => {
    const plan = planFor(TESTNET, launch, step, terms.h0);
    if (!plan) throw new Error("no plan");
    return { plan, costs: costsFor(plan, step, funds) };
  };

  it("counts only confirmed plain coins as spendable, and unconfirmed ones as pending", () => {
    const { costs } = costOf({ kind: "ticket", idle: miner("idle", minerCap), paymaster: null, held: null });
    expect(costs.spendable).toBe(50_000);
    expect(costs.pending).toBe(3_000);
  });

  it("holds a new cell's ticket to the whole round: the arming and the mint are reserved up front", () => {
    const step: SigningStep = { kind: "ticket", idle: null, paymaster: { ...paymaster, feeSats: NEW_CELL.paymaster + 400 }, held: null };
    const { plan, costs } = costOf(step);
    const later = fundingNeeded(ARM_SHAPE, FEE_RATE) + fundingNeeded(mintShape(false), FEE_RATE);
    expect(costs.split).toEqual(NEW_CELL);
    expect(costs.paymasterExtra).toBe(400);
    expect(costs.network).toBe(networkFee(shapeOf(plan), FEE_RATE));
    expect(costs.later).toBe(later);
    expect(costs.reserve).toBe(fundingNeeded(plan, FEE_RATE) + later);
    expect(costs.short).toBe(costs.spendable < costs.reserve);
  });

  it("re-arming reserves only the mint, shaped by the tokens already held", () => {
    const { costs } = costOf({ kind: "ticket", idle: miner("idle", minerCap), paymaster: null, held });
    expect(costs.split).toEqual(REUSE);
    expect(costs.paymasterExtra).toBe(0);
    expect(costs.later).toBe(fundingNeeded(mintShape(true), FEE_RATE));
  });

  it("an arming reserves the mint; the mint reserves nothing after it and pays no split", () => {
    expect(costOf({ kind: "arm", paid: paid(), creating, held: null }).costs.later).toBe(fundingNeeded(mintShape(false), FEE_RATE));
    const mint = costOf({ kind: "mint", miner: miner("armed", minerCap), nonce: 1n, reward: 5n, held: null }).costs;
    expect(mint.later).toBe(0);
    expect(mint.split).toBeNull();
  });

  it("is short when the wallet cannot cover the round", () => {
    const step: SigningStep = { kind: "ticket", idle: null, paymaster, held: null };
    const plan = planFor(TESTNET, launch, step, terms.h0)!;
    expect(costsFor(plan, step, { ...funds, utxos: [coin(1_000, 1)] }).short).toBe(true);
    expect(costsFor(plan, step, { ...funds, utxos: [coin(1_000_000, 1)] }).short).toBe(false);
  });
});
