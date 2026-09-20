import { describe, expect, it } from "vitest";

import type { MinerCell } from "../rgbpp/operations";
import { MIN_CLZ } from "../standard";
import { deriveLoop, inProgress, narrate, statusOf, TICKET_VOUT, type LoopInput, type LoopOperation } from "./loop";

const cell = (state: "idle" | "armed", txid = "aa".repeat(32), anchor = 900): MinerCell => ({
  outPoint: { txHash: "0x" + "12".repeat(32), index: 0 },
  capacity: 1n,
  seal: { txid, vout: 1 },
  data: { state, nonce: 0n, anchor },
});
const op = (kind: LoopOperation["kind"], btcTxid: string, stage: LoopOperation["stage"], extra: Partial<LoopOperation> = {}): LoopOperation => ({
  kind,
  btcTxid,
  stage,
  ckbTxHash: null,
  failure: null,
  ...extra,
});

const base: LoopInput = {
  wallet: "local",
  offered: true,
  launchOpen: true,
  miners: [],
  operations: [],
  bestClz: null,
  dismissed: null,
};
const at = (input: Partial<LoopInput>) => deriveLoop({ ...base, ...input });

describe("which step of the loop a miner is on", () => {
  it("asks for a wallet first, and reads the wallet's cells before deciding anything else", () => {
    expect(at({ wallet: null, miners: null }).state.at).toBe("wallet");
    expect(at({ wallet: null, miners: null }).step).toBe("wallet");
    expect(at({ miners: null }).state.at).toBe("reading");
    expect(at({ miners: null }).step).toBe("ticket");
  });

  it("offers nothing before the opening block", () => {
    const loop = at({ launchOpen: false });
    expect(loop.state.at).toBe("not-open");
    expect(loop.step).toBeNull();
  });

  it("opens a miner cell once, then waits for it to land", () => {
    expect(at({}).state.at).toBe("open");
    const opening = op("open", "01", "sent");
    const loop = at({ operations: [opening] });
    expect(loop.state).toEqual({ at: "opening", op: opening });
    expect(loop.traces.open).toEqual({ txid: "01", stage: "landing", ckbTxHash: null, failure: null });
  });

  it("pays a ticket on an idle cell, keeping the opening's trace", () => {
    const idle = cell("idle");
    const loop = at({ miners: [idle], operations: [op("open", "01", "settled")] });
    expect(loop.state).toEqual({ at: "pay", cell: idle });
    expect(loop.traces.open?.stage).toBe("settled");
    expect(loop.ticket).toBeNull();
  });

  it("mines a ticket the moment it is broadcast, and holds the mint until it settles", () => {
    const loop = at({
      miners: [cell("idle")],
      operations: [op("ticket", "02", "sent", { anchor: 905 }), op("open", "01", "settled")],
      bestClz: 30,
    });
    expect(loop.state.at).toBe("mine");
    expect(loop.state.at === "mine" && loop.state.blocked).toBe("landing");
    expect(loop.ticket).toEqual({ txid: "02", vout: TICKET_VOUT, anchor: 905, settled: false });
    expect(loop.traces.ticket?.stage).toBe("landing");
  });

  it("mints once the armed cell has settled and a hash reaches the minimum", () => {
    const armed = cell("armed", "02".repeat(32), 905);
    const operations = [op("ticket", "02".repeat(32), "settled", { anchor: 905 })];
    const short = at({ miners: [armed], operations, bestClz: MIN_CLZ - 1 });
    expect(short.state.at === "mine" && short.state.blocked).toBe("short");
    const ready = at({ miners: [armed], operations, bestClz: MIN_CLZ });
    expect(ready.state).toEqual({ at: "mint", ticket: { txid: armed.seal.txid, vout: 1, anchor: 905, settled: true }, cell: armed });
    expect(ready.step).toBe("mint");
  });

  it("names a ticket bought in another browser from the chain alone", () => {
    const armed = cell("armed", "07".repeat(32));
    expect(at({ miners: [armed] }).traces.ticket).toEqual({ txid: armed.seal.txid, stage: "settled", ckbTxHash: null, failure: null });
  });

  it("shows a mint landing, then the finished round until the miner asks for the next", () => {
    const armed = cell("armed", "02".repeat(32));
    const ticket = op("ticket", "02".repeat(32), "settled", { anchor: 900 });
    const minting = op("mint", "03", "sent", { atoms: "100" });
    const landing = at({ miners: [armed], operations: [minting, ticket], bestClz: 20 });
    expect(landing.state).toEqual({ at: "minting", op: minting });
    expect(landing.traces.mint?.stage).toBe("landing");
    expect(landing.traces.ticket?.txid).toBe(ticket.btcTxid);

    const idle = cell("idle", "03".repeat(32));
    const minted = { ...minting, stage: "settled" as const };
    const done = at({ miners: [idle], operations: [minted, ticket] });
    expect(done.state).toEqual({ at: "minted", op: minted, cell: idle });
    expect(statusOf("mint", done.step, done.state)).toBe("done");
    expect(done.traces.ticket?.txid).toBe(ticket.btcTxid);

    // "Mine again": a fresh round, with no traces from the last one.
    const again = at({ miners: [idle], operations: [minted, ticket], dismissed: minted.btcTxid });
    expect(again.state).toEqual({ at: "pay", cell: idle });
    expect(again.traces).toEqual({ open: null, ticket: null, mint: null });
  });

  it("keeps each round's traces to its own ticket", () => {
    const operations = [
      op("ticket", "05".repeat(32), "sent", { anchor: 950 }),
      op("mint", "04", "settled"),
      op("ticket", "02", "settled"),
      op("open", "01", "settled"),
    ];
    const loop = at({ miners: [cell("idle", "04".repeat(32))], operations });
    expect(loop.state.at).toBe("mine");
    expect(loop.traces).toEqual({
      open: null,
      ticket: { txid: "05".repeat(32), stage: "landing", ckbTxHash: null, failure: null },
      mint: null,
    });
  });

  it("waits for another operation of the launch before a new ticket", () => {
    const transfer = op("transfer", "09", "queued");
    expect(at({ miners: [cell("idle")], operations: [transfer] }).state).toEqual({ at: "waiting", op: transfer });
  });

  it("stays closed where the site offers no miner, unless a ticket is already held", () => {
    expect(at({ offered: false }).state.at).toBe("closed");
    expect(at({ offered: false, wallet: null, miners: null }).state.at).toBe("closed");
    // Before the wallet's cells are read, "finish" cannot be told from "closed".
    expect(at({ offered: false, miners: null }).state.at).toBe("reading");
    expect(at({ offered: false, miners: [cell("armed")] }).state.at).toBe("mine");
  });

  it("marks the steps behind as done and the ones ahead as next", () => {
    const loop = at({ miners: [cell("armed")] });
    expect(statusOf("wallet", loop.step, loop.state)).toBe("done");
    expect(statusOf("ticket", loop.step, loop.state)).toBe("done");
    expect(statusOf("mine", loop.step, loop.state)).toBe("active");
    expect(statusOf("mint", loop.step, loop.state)).toBe("todo");
  });

  it("opens the page on the loop once it is under way, not before", () => {
    expect(inProgress(at({}).state)).toBe(false);
    expect(inProgress(at({ miners: [cell("idle")] }).state)).toBe(false);
    expect(inProgress(at({ miners: [cell("armed")] }).state)).toBe(true);
  });
});

describe("what the page says is happening", () => {
  const ctx = { symbol: "DEMO", running: false, unfunded: false, auto: false, busy: false };

  it("says what is happening now and what comes next", () => {
    expect(narrate(at({ wallet: null, miners: null }).state, ctx)).toEqual({
      now: "You haven't connected a wallet yet",
      next: "Pick one below — then the ticket",
    });
    expect(narrate(at({ miners: [cell("idle")] }).state, ctx)?.now).toBe("Pay the ticket to start mining");
    expect(narrate(at({ miners: [cell("idle")] }).state, { ...ctx, auto: true })?.now).toBe("Paying the ticket");
    expect(narrate(at({ miners: [cell("armed")] }).state, { ...ctx, running: true })).toEqual({
      now: "Mining DEMO",
      next: `Minting unlocks at ${MIN_CLZ} zero bits`,
    });
  });

  it("puts a missing balance first", () => {
    expect(narrate(at({}).state, { ...ctx, unfunded: true, auto: true })?.now).toBe("Your wallet needs bitcoin");
  });

  it("leaves a launch that is not on offer to the page", () => {
    expect(narrate(at({ offered: false }).state, ctx)).toBeNull();
    expect(narrate(at({ launchOpen: false }).state, ctx)).toBeNull();
  });
});
