import { describe, expect, it } from "vitest";

import type { LoopOperation, LoopState, LoopStep, Ticket, Trace, Traces } from "@/domain/mining";
import type { MinerCell } from "@/domain/rgbpp";
import { MIN_CLZ } from "@/domain/protocol";
import { ledgerOf, mineLine, mintedAmount, mintLine, progressOf, ticketLine, type WizardInput } from "./progress";

const ticket: Ticket = { txid: "aa", vout: 1, anchor: 100, settled: false };
const cell = {} as MinerCell;
const op = (over: Partial<LoopOperation> = {}): LoopOperation => ({
  kind: "mint",
  btcTxid: "bb",
  stage: "sent",
  ckbTxHash: null,
  failure: null,
  ...over,
});
const trace = (stage: Trace["stage"]): Trace => ({ txid: "cc", stage, ckbTxHash: null, failure: null });
const NO_TRACES: Traces = { ticket: null, arm: null, mint: null };

const stepOf: Record<LoopState["at"], LoopStep | null> = {
  "not-open": null,
  wallet: "wallet",
  reading: "ticket",
  buy: "ticket",
  waiting: "ticket",
  mine: "mine",
  mint: "mint",
  minting: "mint",
  minted: "mint",
};

function input(state: LoopState, over: Partial<Omit<WizardInput, "loop">> & { traces?: Partial<Traces>; activates?: boolean; best?: number | null; next?: bigint; running?: boolean } = {}): WizardInput {
  return {
    loop: { state, step: stepOf[state.at], traces: { ...NO_TRACES, ...over.traces }, activates: over.activates ?? false },
    keeping: over.keeping ?? false,
    mintable: over.mintable ?? 0n,
    mining: {
      running: over.running ?? false,
      progress: { next: over.next ?? 0n, best: over.best == null ? null : { clz: over.best } },
    },
  };
}

describe("progressOf", () => {
  it("asks for a wallet, then reports it connected", () => {
    expect(progressOf("wallet", input({ at: "wallet" }))).toEqual({ word: "connect", tone: "act" });
    expect(progressOf("wallet", input({ at: "buy", cell: null }))).toEqual({ word: "connected", tone: "done" });
  });

  it("never calls a ticket confirmed while it is still settling", () => {
    const mining: LoopState = { at: "mine", ticket, unarmed: null };
    expect(progressOf("ticket", input(mining, { traces: { ticket: trace("landing") } }))).toEqual({ word: "settling", tone: "wait" });
    expect(progressOf("ticket", input(mining, { traces: { ticket: trace("failed") } }))).toEqual({ word: "failed", tone: "act" });
    expect(progressOf("ticket", input(mining, { traces: { ticket: trace("settled") } }))).toEqual({ word: "confirmed", tone: "done" });
  });

  it("follows the ticket through paying, waiting and activation", () => {
    expect(progressOf("ticket", input({ at: "buy", cell: null }))).toEqual({ word: "to pay", tone: "act" });
    expect(progressOf("ticket", input({ at: "reading" }))).toEqual({ word: "next", tone: "todo" });
    expect(progressOf("ticket", input({ at: "waiting", op: op({ kind: "ticket" }) }))).toEqual({ word: "waiting", tone: "wait" });
    expect(progressOf("ticket", input({ at: "mine", ticket, unarmed: { why: "arm", cell } }))).toEqual({ word: "activate", tone: "act" });
    expect(progressOf("ticket", input({ at: "mine", ticket, unarmed: { why: "arming", op: op({ kind: "arm" }) } }))).toEqual({
      word: "activating",
      tone: "wait",
    });
  });

  it("reads mining from the session: start, mining, a qualifying hash, a chosen one", () => {
    const mining: LoopState = { at: "mine", ticket, unarmed: null };
    expect(progressOf("mine", input({ at: "buy", cell: null }))).toEqual({ word: "next", tone: "todo" });
    expect(progressOf("mine", input(mining))).toEqual({ word: "start", tone: "act" });
    expect(progressOf("mine", input(mining, { running: true }))).toEqual({ word: "mining", tone: "wait" });
    expect(progressOf("mine", input(mining, { best: MIN_CLZ }))).toEqual({ word: "hash ok", tone: "act" });
    expect(progressOf("mine", input(mining, { best: MIN_CLZ, keeping: true }))).toEqual({ word: "hash chosen", tone: "done" });
    expect(progressOf("mine", input({ at: "minting", op: op() }))).toEqual({ word: "done", tone: "done" });
  });

  it("reports the mint as settling, then confirmed or failed", () => {
    expect(progressOf("mint", input({ at: "buy", cell: null }))).toEqual({ word: "next", tone: "todo" });
    expect(progressOf("mint", input({ at: "mine", ticket, unarmed: null }, { keeping: true }))).toEqual({ word: "to sign", tone: "act" });
    expect(progressOf("mint", input({ at: "minting", op: op() }))).toEqual({ word: "settling", tone: "wait" });
    expect(progressOf("mint", input({ at: "minted", op: op({ stage: "settled" }), cell: null }))).toEqual({ word: "confirmed", tone: "done" });
    expect(progressOf("mint", input({ at: "minted", op: op({ stage: "failed" }), cell: null }))).toEqual({ word: "failed", tone: "act" });
  });
});

describe("ledgerOf", () => {
  it("has no round to describe before the wallet is read", () => {
    expect(ledgerOf(input({ at: "wallet" }), "MESH")).toBeNull();
    expect(ledgerOf(input({ at: "reading" }), "MESH")).toBeNull();
  });

  it("lists the activation only for a round that has one", () => {
    const state: LoopState = { at: "mine", ticket, unarmed: { why: "landing" } };
    expect(ledgerOf(input(state), "MESH")?.map((i) => i.label)).toEqual(["Ticket payment", "Best hash", "Mint of MESH"]);
    const withArm = ledgerOf(input(state, { activates: true, traces: { ticket: trace("landing") } }), "MESH");
    expect(withArm?.map((i) => [i.label, i.p.word])).toEqual([
      ["Ticket payment", "settling"],
      ["Activation", "after the ticket settles"],
      ["Best hash", "not yet"],
      ["Mint of MESH", "not yet"],
    ]);
  });

  it("says whether the best hash is mintable", () => {
    const state: LoopState = { at: "mine", ticket, unarmed: null };
    expect(ledgerOf(input(state, { best: MIN_CLZ - 1 }), "MESH")?.[1].p).toEqual({ word: `${MIN_CLZ - 1} bits · needs ${MIN_CLZ}`, tone: "wait" });
    expect(ledgerOf(input(state, { best: MIN_CLZ }), "MESH")?.[1].p).toEqual({ word: `${MIN_CLZ} bits · mintable`, tone: "done" });
  });

  it("asks for the mint's signature only once a hash is kept on the mint step", () => {
    const state: LoopState = { at: "mint", ticket, cell };
    expect(ledgerOf(input(state, { keeping: true }), "MESH")?.at(-1)?.p).toEqual({ word: "to sign", tone: "act" });
    expect(ledgerOf(input(state), "MESH")?.at(-1)?.p).toEqual({ word: "not yet", tone: "todo" });
  });
});

describe("step headlines", () => {
  it("tells a buyer whether the ticket creates a cell", () => {
    expect(ticketLine({ at: "buy", cell })).toMatch(/^One payment: its output is your challenge/);
    expect(ticketLine({ at: "buy", cell: null })).toMatch(/creates your miner cell/);
    expect(ticketLine({ at: "waiting", op: op({ kind: "arm" }) })).toBe("Waiting for your arm to land.");
  });

  it("distinguishes a fresh start from a pause", () => {
    const state: LoopState = { at: "mine", ticket, unarmed: null };
    expect(mineLine(state, input(state))).toBe("Start: your browser hashes your ticket's challenge.");
    expect(mineLine(state, input(state, { next: 5n }))).toBe("Paused — Continue picks up exactly where it stopped.");
    expect(mineLine(state, input(state, { running: true }))).toBe("Mining — the best hash so far sets what you mint.");
  });

  it("names the amount sent and received", () => {
    expect(mintLine({ at: "minting", op: op({ atoms: "250000000" }) }, input({ at: "buy", cell: null }), "MESH")).toBe(
      "Mint sent: 2.5 MESH arrive after one Bitcoin block. Nothing more to sign.",
    );
    expect(mintLine({ at: "minted", op: op({ stage: "failed" }), cell: null }, input({ at: "buy", cell: null }), "MESH")).toBe(
      "The mint did not complete on CKB.",
    );
  });

  it("formats a recorded amount, and nothing when there is none", () => {
    expect(mintedAmount("125000000")).toBe("1.25");
    expect(mintedAmount(undefined)).toBe("");
  });
});
