/* Where a miner stands on one launch: which step of the loop, and what it left behind.
 *
 * The loop is wallet → ticket → mine → mint, and the step a person is on is a
 * function of facts, never of what the page last did: the wallet, the miner
 * cells sealed to it, the operations still landing and the best hash found on
 * the current ticket. So a reload, a second tab or a mint made elsewhere all
 * land on the same step, and the page keeps no second copy of the truth.
 *
 * The ticket is the round's one payment. With an idle miner cell it arms that
 * cell at once; without one it creates the cell, paid, and a second signature
 * — which pays only the network — arms it once the ticket has settled.
 * Mining starts the moment the ticket is broadcast either way: its output 1 is
 * the challenge and exists as soon as the transaction does (a cell armed from
 * paid names it, `MinerCellData.ticket`). So the arming happens while the
 * miner mines, and only the mint waits — for the armed cell to settle on CKB,
 * because the mint spends it.
 *
 * Each completed step leaves a trace: the Bitcoin transaction it was, and
 * whether it is still landing or has settled. A "round" is one ticket and its
 * mint; the traces shown are the current round's, so the next ticket starts
 * with a clean slate while the last mint stays one click away in Activity.
 */

import { challengeOutpoint, TICKET_VOUT, type MinerCell } from "../rgbpp/operations";
import { MIN_CLZ } from "../standard";

/** The wallet this page has, by kind, or none. Only the kind matters to the loop. */
export type WalletKind = "passkey" | "local" | "demo";

/** An operation as the loop reads it. `state/TokensProvider` `Operation` satisfies it. */
export interface LoopOperation {
  kind: "open" | "ticket" | "arm" | "mint" | "transfer" | "list" | "buy" | "cancel";
  btcTxid: string;
  stage: "sent" | "queued" | "settled" | "failed";
  ckbTxHash: string | null;
  failure: string | null;
  anchor?: number;
  atoms?: string;
  /** A ticket that created its miner cell, paid, rather than arming one. */
  newCell?: boolean;
}

/** The ticket being mined: its Bitcoin output is the challenge. */
export interface Ticket {
  txid: string;
  vout: number;
  /** Height the ticket's rate is fixed at. */
  anchor: number;
  /** True once the armed cell exists on CKB, which a mint needs. */
  settled: boolean;
}

export { TICKET_VOUT };

export type TraceStage = "landing" | "settled" | "failed";

/** What a finished step leaves on screen: its transaction and how far it has got. */
export interface Trace {
  txid: string;
  stage: TraceStage;
  ckbTxHash: string | null;
  failure: string | null;
}

export interface Traces {
  ticket: Trace | null;
  /** The arming of a paid cell, in a round that created its miner cell. */
  arm: Trace | null;
  mint: Trace | null;
}

export type LoopState =
  /** The site offers no miner on this launch and this wallet holds no ticket here. */
  | { at: "closed" }
  /** The launch has not reached its opening block. */
  | { at: "not-open" }
  | { at: "wallet" }
  /** The wallet is known; its cells are not read yet. */
  | { at: "reading" }
  /** Buy a ticket: re-arming this idle cell, or creating the cell when there is none. */
  | { at: "buy"; cell: MinerCell | null }
  /** Something else of this launch is landing; the next step waits for it. */
  | { at: "waiting"; op: LoopOperation }
  /** A ticket to mine; `unarmed` says what the mint still waits for, null once it waits only for a hash. */
  | { at: "mine"; ticket: Ticket; unarmed: Unarmed | null }
  | { at: "mint"; ticket: Ticket; cell: MinerCell }
  | { at: "minting"; op: LoopOperation }
  /** The round is complete: the tokens are minted (or landing is over). */
  | { at: "minted"; op: LoopOperation; cell: MinerCell | null };

/**
 * Why a ticket being mined cannot be minted yet, whatever the hash.
 * `landing`: the ticket is not on CKB yet. `arm`: its paid cell is, and waits
 * for the arming signature. `arming`: that signature is landing.
 */
export type Unarmed = { why: "landing" } | { why: "arm"; cell: MinerCell } | { why: "arming"; op: LoopOperation };

/** The four steps a person sees. `wallet` shows only while there is none. */
export type LoopStep = "wallet" | "ticket" | "mine" | "mint";

export const STEPS: readonly LoopStep[] = ["wallet", "ticket", "mine", "mint"];

export interface LoopInput {
  wallet: WalletKind | null;
  /** True when this site offers new tickets on the launch (`canMine`). */
  offered: boolean;
  /** True once the launch's opening block has passed. */
  launchOpen: boolean;
  /** Miner cells of this launch sealed to the wallet; null until read. */
  miners: readonly MinerCell[] | null;
  /** This launch's operations, newest first. */
  operations: readonly LoopOperation[];
  /** Leading zero bits of the best hash on the current ticket. */
  bestClz: number | null;
  /** The mint whose completion the person has moved on from ("Mine again"). */
  dismissed: string | null;
}

export interface Loop {
  state: LoopState;
  /** The step highlighted; null when the loop is not on offer at all. */
  step: LoopStep | null;
  traces: Traces;
  /** The ticket to mine against, whatever the step; null when there is none. */
  ticket: Ticket | null;
}

const isLanding = (op: LoopOperation) => op.stage === "sent" || op.stage === "queued";
const LOOP_KINDS = new Set<LoopOperation["kind"]>(["ticket", "arm", "mint"]);

export function traceOf(op: LoopOperation): Trace {
  return {
    txid: op.btcTxid,
    stage: isLanding(op) ? "landing" : op.stage === "settled" ? "settled" : "failed",
    ckbTxHash: op.ckbTxHash,
    failure: op.failure,
  };
}

/**
 * The ticket to mine: the armed cell's challenge, the paid cell's ticket, or
 * a ticket still landing. Only an armed cell can be minted (`settled`).
 */
export function currentTicket(armed: MinerCell | null, paid: MinerCell | null, landing: LoopOperation | undefined): Ticket | null {
  if (armed) {
    const { txid, vout } = challengeOutpoint(armed);
    return { txid, vout, anchor: armed.data.anchor, settled: true };
  }
  if (paid) return { txid: paid.seal.txid, vout: TICKET_VOUT, anchor: paid.data.anchor, settled: false };
  if (landing?.kind === "ticket" && landing.anchor !== undefined) {
    return { txid: landing.btcTxid, vout: TICKET_VOUT, anchor: landing.anchor, settled: false };
  }
  return null;
}

export function deriveLoop(input: LoopInput): Loop {
  const { miners, operations } = input;
  const idle = miners?.find((m) => m.data.state === "idle") ?? null;
  const armed = miners?.find((m) => m.data.state === "armed") ?? null;
  const paid = miners?.find((m) => m.data.state === "paid") ?? null;
  const landing = operations.find(isLanding);
  const ticket = currentTicket(armed, paid, landing);
  const loopOps = operations.filter((op) => LOOP_KINDS.has(op.kind));
  const lastMint = loopOps.find((op) => op.kind === "mint");

  const state = stateOf(input, { idle, armed, paid, landing, ticket, loopOps, lastMint });
  const roundClosed = state.at === "minting" || state.at === "minted";

  // The current round: every loop operation newer than the last mint, or, once
  // that mint is the round's own, newer than the mint before it.
  const firstMint = loopOps.findIndex((op) => op.kind === "mint");
  const secondMint = firstMint < 0 ? -1 : loopOps.findIndex((op, i) => i > firstMint && op.kind === "mint");
  const end = roundClosed ? (secondMint < 0 ? loopOps.length : secondMint) : firstMint < 0 ? loopOps.length : firstMint;
  const round = loopOps.slice(0, end);

  const armOp = round.find((op) => op.kind === "arm");
  const ticketOp = round.find((op) => op.kind === "ticket");
  let ticketTrace = ticketOp ? traceOf(ticketOp) : null;
  // A ticket bought in another browser has no operation here; the chain still names it.
  if (!ticketTrace && !armOp && ticket) ticketTrace = { txid: ticket.txid, stage: ticket.settled ? "settled" : "landing", ckbTxHash: null, failure: null };

  return {
    state,
    step: stepOf(state),
    traces: {
      ticket: ticketTrace,
      arm: armOp ? traceOf(armOp) : null,
      mint: roundClosed ? traceOf(state.op) : null,
    },
    ticket,
  };
}

function stateOf(
  input: LoopInput,
  facts: {
    idle: MinerCell | null;
    armed: MinerCell | null;
    paid: MinerCell | null;
    landing: LoopOperation | undefined;
    ticket: Ticket | null;
    loopOps: readonly LoopOperation[];
    lastMint: LoopOperation | undefined;
  },
): LoopState {
  const { idle, armed, paid, landing, ticket, lastMint } = facts;
  // A launch the site does not offer mining on stays finishable for a wallet
  // that already paid for a ticket there; before its cells are read, "finish"
  // cannot be told from "closed".
  const holdsTicket = ticket !== null || landing !== undefined || paid !== null;
  if (!input.offered && !holdsTicket && (input.wallet === null || input.miners !== null)) return { at: "closed" };
  if (!input.launchOpen) return { at: "not-open" };
  if (input.wallet === null) return { at: "wallet" };
  if (input.miners === null) return { at: "reading" };

  if (landing?.kind === "mint") return { at: "minting", op: landing };
  if (ticket) {
    if (armed) {
      const qualifies = input.bestClz !== null && input.bestClz >= MIN_CLZ;
      return qualifies ? { at: "mint", ticket, cell: armed } : { at: "mine", ticket, unarmed: null };
    }
    const unarmed: Unarmed = !paid
      ? { why: "landing" }
      : landing?.kind === "arm"
        ? { why: "arming", op: landing }
        : { why: "arm", cell: paid };
    return { at: "mine", ticket, unarmed };
  }
  if (landing) return { at: "waiting", op: landing };
  // The last thing this loop did was a mint: the round is complete until the
  // person asks for the next one. A first mint leaves no miner cell behind.
  const lastLoop = facts.loopOps[0];
  if (lastMint && lastLoop === lastMint && input.dismissed !== lastMint.btcTxid) {
    return { at: "minted", op: lastMint, cell: idle };
  }
  return { at: "buy", cell: idle };
}

export function stepOf(state: LoopState): LoopStep | null {
  switch (state.at) {
    case "closed":
    case "not-open":
      return null;
    case "wallet":
      return "wallet";
    case "reading":
    case "buy":
    case "waiting":
      return "ticket";
    case "mine":
      return "mine";
    case "mint":
    case "minting":
    case "minted":
      return "mint";
  }
}

export type StepStatus = "done" | "active" | "todo";

/** Whether `step` is behind, at or ahead of where the loop stands. */
export function statusOf(step: LoopStep, current: LoopStep | null, state: LoopState): StepStatus {
  if (current === null) return "todo";
  if (state.at === "minted" && step === "mint") return "done";
  const at = STEPS.indexOf(current);
  const i = STEPS.indexOf(step);
  return i < at ? "done" : i === at ? "active" : "todo";
}

/** True when the loop has gone past a fresh start, so the page opens on it without a click. */
export function inProgress(state: LoopState): boolean {
  return ["waiting", "mine", "mint", "minting", "minted"].includes(state.at);
}

/** What is happening now and what comes next, one short line each. */
export interface Narration {
  now: string;
  next: string;
}

export interface NarrationContext {
  symbol: string;
  running: boolean;
  /** The wallet lacks the bitcoin the current step needs. */
  unfunded: boolean;
  busy: boolean;
}

const LANDING_NAMES: Record<LoopOperation["kind"], string> = {
  open: "miner cell",
  ticket: "ticket",
  arm: "ticket's arming",
  mint: "mint",
  transfer: "transfer",
  list: "listing",
  buy: "purchase",
  cancel: "cancellation",
};

const UNARMED_NEXT: Record<Unarmed["why"] | "armed", string> = {
  landing: "Minting waits for one Bitcoin block",
  arm: "Arm your ticket — network fee only",
  arming: "Minting waits for the arming's block",
  armed: `Minting unlocks at ${MIN_CLZ} zero bits`,
};

/** Null where the loop is not on offer: the page says why in its own words. */
export function narrate(state: LoopState, ctx: NarrationContext): Narration | null {
  switch (state.at) {
    case "closed":
    case "not-open":
      return null;
    case "wallet":
      return { now: "No wallet connected", next: "Pick one — then the ticket" };
    case "reading":
      return { now: "Reading your wallet", next: "Then the ticket" };
    case "buy":
      if (ctx.unfunded) return { now: "Your wallet needs bitcoin", next: "The ticket unlocks once it arrives" };
      return { now: ctx.busy ? "Signing the ticket" : "Buy the ticket", next: "Then mine at once" };
    case "waiting":
      return { now: `Your ${LANDING_NAMES[state.op.kind]} is landing`, next: "The ticket, once it settles" };
    case "mine":
      if (state.unarmed?.why === "arm" && ctx.busy) return { now: "Signing the arming", next: "Mining goes on" };
      return { now: ctx.running ? `Mining ${ctx.symbol}` : "Mining paused", next: UNARMED_NEXT[state.unarmed?.why ?? "armed"] };
    case "mint":
      return { now: "Your hash qualifies", next: "Mint it — or keep mining for a stronger one" };
    case "minting":
      return { now: `Minting your ${ctx.symbol}`, next: "The tokens arrive after one Bitcoin block" };
    case "minted":
      return state.op.stage === "failed"
        ? { now: "The mint did not complete", next: "See the transaction" }
        : { now: `${ctx.symbol} minted`, next: "Mine again with a new ticket" };
  }
}
