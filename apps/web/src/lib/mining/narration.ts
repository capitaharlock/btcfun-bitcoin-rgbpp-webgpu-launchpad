/* The mining loop in words: what is happening now and what comes next.
 *
 * One short line each, derived from the loop's state (`./loop.ts`) and never
 * stored, so the header and the wizard say the same thing about the same step.
 */

import { MIN_CLZ } from "../standard";
import type { LoopOperation, LoopState, Unarmed } from "./loop";

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
  arm: "ticket's activation",
  mint: "mint",
  transfer: "transfer",
  list: "listing",
  buy: "purchase",
  cancel: "cancellation",
};

const UNARMED_NEXT: Record<Unarmed["why"] | "armed", string> = {
  landing: "Minting waits for the ticket to settle, about one Bitcoin block",
  arm: "Activate your ticket — network fee only",
  arming: "Minting waits for the activation's block",
  armed: `Minting unlocks at ${MIN_CLZ} zero bits`,
};

/** Null where the loop is not on offer: the page says why in its own words. */
export function narrate(state: LoopState, ctx: NarrationContext): Narration | null {
  switch (state.at) {
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
      if (state.unarmed?.why === "arm" && ctx.busy) return { now: "Signing the activation", next: "Mining goes on" };
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
