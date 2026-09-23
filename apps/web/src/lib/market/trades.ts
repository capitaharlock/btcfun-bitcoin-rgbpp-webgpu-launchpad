/* Trades, and what becomes of a bid.
 *
 * A trade is not taken from anyone's word. A `fill` event only points at a
 * Bitcoin transaction; that transaction is a sale of a listing when it spends
 * the listing's sealed output at input 0 and pays the listing's price to its
 * seller at output 0 — the one pairing the seller's SINGLE|ANYONECANPAY
 * signature allows. This establishes a Bitcoin payment and an RGB++
 * commitment, not CKB delivery: that requires the committed CKB transaction
 * to confirm separately. Anything a fill event claims beyond the Bitcoin
 * evidence is ignored.
 */

import type { ChainTx } from "../bitcoin/provider";
import { BUYER_SEAL_VOUT, type Listing } from "../rgbpp/sale";
import type { Bid } from "./bid";

export interface Trade {
  txid: string;
  launchId: string;
  amount: bigint;
  priceSats: number;
  /** Address the tokens were sealed to. */
  buyer: string | null;
  /** The bid the listing answered, if it was signed to meet one. */
  bid: string | null;
  confirmed: boolean;
}

/** Why `tx` is not a sale of `listing`, or null when it is. */
export function saleFault(listing: Listing, tx: ChainTx): string | null {
  const input = tx.inputs[0];
  if (!input || input.txid !== listing.seal.txid || input.vout !== listing.seal.vout) {
    return "The transaction does not spend the listed output first.";
  }
  const price = tx.outputs[0];
  if (!price || price.address !== listing.seller || price.value !== listing.priceSats) {
    return "The transaction does not pay the seller the listed price.";
  }
  if (!tx.outputs[1]?.script.startsWith("6a20")) return "The transaction carries no RGB++ commitment.";
  return null;
}

/** The Bitcoin payment `tx` records for a listing; CKB delivery is not checked here. */
export function tradeOf(listing: Listing, tx: ChainTx): Trade | null {
  if (saleFault(listing, tx) !== null) return null;
  return {
    txid: tx.txid,
    launchId: listing.launchId,
    amount: BigInt(listing.amount),
    priceSats: listing.priceSats,
    buyer: tx.outputs[BUYER_SEAL_VOUT]?.address ?? null,
    bid: listing.bid ?? null,
    confirmed: tx.confirmed,
  };
}

/** Whether a listing is the one a holder signed to meet `bid`. */
export function meetsBid(listing: Listing, bidId: string, bid: Bid): boolean {
  return (
    listing.bid === bidId &&
    listing.tokenId === bid.tokenId &&
    listing.amount === bid.amount &&
    listing.priceSats === bid.priceSats
  );
}

export type BidStatus<L> =
  /** Waiting for a holder. */
  | { state: "open" }
  /** A holder signed a listing for exactly these terms; the bidder can complete it. */
  | { state: "accepted"; listing: L }
  /** The bidder bought a listing signed for it. */
  | { state: "filled"; trade: Trade }
  /** The bidder withdrew it. */
  | { state: "cancelled" };

/**
 * Where a bid stands, from what is public.
 *
 * A fill counts only when the tokens went to the bidder: a listing signed for
 * a bid is still an open listing, and if someone else buys it first the bid
 * is simply open again. A fill outranks a withdrawal because it already
 * happened on chain; a withdrawal outranks an acceptance because the bidder
 * has said they will not complete it.
 */
export function bidStatus<L extends { listing: Listing }>(
  id: string,
  bid: Bid,
  context: { listings: readonly L[]; trades: readonly Trade[]; cancelled: boolean },
): BidStatus<L> {
  const trade = context.trades.find((t) => t.bid === id && t.buyer === bid.bidder && t.amount.toString() === bid.amount);
  if (trade) return { state: "filled", trade };
  if (context.cancelled) return { state: "cancelled" };
  const listing = context.listings.find((l) => meetsBid(l.listing, id, bid));
  return listing ? { state: "accepted", listing } : { state: "open" };
}
