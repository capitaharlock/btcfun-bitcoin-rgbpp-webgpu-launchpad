/* What the mining wizard says about each step, as pure functions of the loop.
 *
 * The rail's one word per step, the round ledger's line and each step's
 * headline are all read off the same loop state, so they are computed here
 * without React and unit-tested: a wrong word on the rail ("confirmed" for a
 * ticket still settling) is exactly the kind of overstatement the page must
 * never make.
 */

import { atoms } from "../../../lib/format";
import { statusOf, type Loop, type LoopState, type LoopStep, type Trace } from "../../../lib/mining/loop";
import { DECIMALS, MIN_CLZ } from "../../../lib/standard";

/** The parts of the mining loop (`hooks/useMiningLoop`) the words are read from. */
export interface WizardInput {
  loop: Pick<Loop, "state" | "step" | "traces" | "activates">;
  /** The person chose the best hash so far; the mint step is theirs to sign. */
  keeping: boolean;
  mintable: bigint;
  mining: { running: boolean; progress: { next: bigint; best: { clz: number } | null } };
}

/**
 * How far a step has got, in one word and a tone the rail colours: `done`
 * (green, confirmed on chain), `wait` (cyan, sent and waiting for a block),
 * `act` (accent, waiting for the person), `todo` (faint, later).
 */
export type Tone = "done" | "wait" | "act" | "todo";
export interface Progress {
  word: string;
  tone: Tone;
}

export function progressOf(step: LoopStep, ml: WizardInput): Progress {
  const { state, traces } = ml.loop;
  const qualifies = (ml.mining.progress.best?.clz ?? 0) >= MIN_CLZ;
  const at = statusOf(step, ml.loop.step, state);
  switch (step) {
    case "wallet":
      return state.at === "wallet" ? { word: "connect", tone: "act" } : { word: "connected", tone: "done" };
    case "ticket": {
      if (state.at === "buy") return { word: "to pay", tone: "act" };
      if (state.at === "reading" || state.at === "wallet") return { word: "next", tone: "todo" };
      if (state.at === "waiting") return { word: "waiting", tone: "wait" };
      if (state.at === "mine" && state.unarmed?.why === "arm") return { word: "activate", tone: "act" };
      if (state.at === "mine" && state.unarmed?.why === "arming") return { word: "activating", tone: "wait" };
      if (traces.ticket?.stage === "landing") return { word: "settling", tone: "wait" };
      if (traces.ticket?.stage === "failed") return { word: "failed", tone: "act" };
      return { word: "confirmed", tone: "done" };
    }
    case "mine":
      if (state.at === "minting" || state.at === "minted") return { word: "done", tone: "done" };
      if (state.at !== "mine" && state.at !== "mint") return { word: "next", tone: "todo" };
      if (ml.keeping) return { word: "hash chosen", tone: "done" };
      if (qualifies) return { word: "hash ok", tone: "act" };
      return ml.mining.running ? { word: "mining", tone: "wait" } : { word: "start", tone: "act" };
    case "mint":
      if (state.at === "minting") return { word: "settling", tone: "wait" };
      if (state.at === "minted") return state.op.stage === "failed" ? { word: "failed", tone: "act" } : { word: "confirmed", tone: "done" };
      if (ml.keeping) return { word: "to sign", tone: "act" };
      return { word: at === "todo" ? "next" : "later", tone: "todo" };
  }
}

/**
 * The round's transactions in order — ticket, activation when the round has
 * one, best hash, mint — each with how far it has got. Null before the
 * wallet is read: there is no round to describe yet.
 */
export function ledgerOf(ml: WizardInput, symbol: string): Array<{ label: string; p: Progress }> | null {
  const { state, traces, activates } = ml.loop;
  const best = ml.mining.progress.best?.clz ?? null;
  const tx = (trace: Trace | null, before: Progress): Progress =>
    !trace ? before : trace.stage === "settled" ? { word: "confirmed", tone: "done" } : trace.stage === "failed" ? { word: "failed", tone: "act" } : { word: "settling", tone: "wait" };
  const items: Array<{ label: string; p: Progress }> = [
    { label: "Ticket payment", p: tx(traces.ticket, state.at === "buy" ? { word: "to sign", tone: "act" } : { word: "not yet", tone: "todo" }) },
  ];
  if (activates) {
    const unarmed = state.at === "mine" ? state.unarmed : null;
    const before: Progress =
      unarmed?.why === "arm" ? { word: "to sign", tone: "act" } : unarmed?.why === "landing" ? { word: "after the ticket settles", tone: "todo" } : { word: "not yet", tone: "todo" };
    items.push({ label: "Activation", p: tx(traces.arm, before) });
  }
  items.push({
    label: "Best hash",
    p:
      best === null
        ? { word: "not yet", tone: "todo" }
        : best >= MIN_CLZ
          ? { word: `${best} bits · mintable`, tone: "done" }
          : { word: `${best} bits · needs ${MIN_CLZ}`, tone: "wait" },
  });
  items.push({ label: `Mint of ${symbol}`, p: tx(traces.mint, ml.keeping && state.at === "mint" ? { word: "to sign", tone: "act" } : { word: "not yet", tone: "todo" }) });
  if (state.at === "wallet" || state.at === "reading") return null;
  return items;
}

// ── each step's headline ───────────────────────────────────────────────────

export function ticketLine(state: LoopState): string {
  switch (state.at) {
    case "wallet":
      return "Connect a wallet first.";
    case "reading":
      return "Reading your wallet…";
    case "buy":
      return state.cell
        ? "One payment: its output is your challenge, and mining starts as soon as it is sent."
        : "One payment: it creates your miner cell, and mining starts as soon as it is sent. Later, one small signature activates it for the mint.";
    case "waiting":
      return `Waiting for your ${state.op.kind} to land.`;
    default:
      return "Ticket sent — mine now, no need to wait for Bitcoin.";
  }
}

export function mineLine(state: LoopState, ml: WizardInput): string {
  switch (state.at) {
    case "mine":
    case "mint":
      if (ml.mining.running) return "Mining — the best hash so far sets what you mint.";
      if ((ml.mining.progress.best?.clz ?? 0) >= MIN_CLZ) return "A hash qualifies. Accept it, or continue for a stronger one.";
      return ml.mining.progress.next > 0n ? "Paused — Continue picks up exactly where it stopped." : "Start: your browser hashes your ticket's challenge.";
    case "minting":
    case "minted":
      return "Done — your hash is in the mint.";
    default:
      return `Once the ticket is sent. A hash of ${MIN_CLZ}+ zero bits mints.`;
  }
}

export function mintLine(state: LoopState, ml: WizardInput, symbol: string): string {
  switch (state.at) {
    case "mine":
      if (!ml.keeping) return `Accept a hash of ${MIN_CLZ}+ zero bits to mint it.`;
      return state.unarmed?.why === "arm"
        ? "Hash chosen. First activate your ticket (network fee only), then sign the mint."
        : "Hash chosen. The mint unlocks when your ticket is active on-chain — about one Bitcoin block.";
    case "mint":
      return `Last signature: it creates ${atoms(ml.mintable, DECIMALS, 2)} ${symbol} in your wallet. Network fee only.`;
    case "minting":
      return `Mint sent: ${mintedAmount(state.op.atoms)} ${symbol} arrive after one Bitcoin block. Nothing more to sign.`;
    case "minted":
      return state.op.stage === "failed" ? "The mint did not complete on CKB." : `Done: ${mintedAmount(state.op.atoms)} ${symbol} are confirmed in your wallet.`;
    default:
      return `Accept a hash of ${MIN_CLZ}+ zero bits to mint it.`;
  }
}

/** A mint's amount as recorded on its operation (atoms, decimal string), or nothing when unknown. */
export function mintedAmount(raw: string | undefined): string {
  return raw ? atoms(BigInt(raw), DECIMALS, 2) : "";
}
