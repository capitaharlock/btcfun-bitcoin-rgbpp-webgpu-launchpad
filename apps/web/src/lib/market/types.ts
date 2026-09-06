/* Marketplace: signed offers to swap tokens for satoshis.
 *
 * WHAT IS REAL HERE. An offer is a signed commitment: the maker's key
 * authorises a specific quantity of a specific launch's tokens at a specific
 * price, to a specific payment address, with an expiry. Nobody can forge one,
 * alter one, or replay one against a different launch. A fill is a real
 * Bitcoin payment carrying a commitment to the offer's id, so the payment is
 * evidence and not just a coincidence of amount.
 *
 * WHAT IS NOT REAL — and this is the important part. The swap is not atomic.
 * The taker pays first and the maker then signs a transfer record. A maker who
 * takes the payment and never signs keeps both. No amount of care in this file
 * fixes that, because the two legs settle on different systems and nothing
 * binds them.
 *
 * THIS IS EXACTLY THE PROBLEM RGB++ EXISTS TO SOLVE. Under single-use seals,
 * a token transfer is authorised by spending a particular Bitcoin UTXO. The
 * maker's offer would commit to that UTXO; the taker's payment would spend it;
 * and the same Bitcoin transaction that moves the satoshis would be the one
 * that authorises the token movement. One transaction, both legs, atomic — no
 * escrow, no operator, no trusted matcher. That is task `V3`, and the shape of
 * this module is deliberately the shape that upgrade needs: an offer already
 * commits to everything a seal would, except the seal itself.
 *
 * Until then the UI ranks every offer by the counterparty risk it carries and
 * never uses the word "trade".
 */

/** The maker's side: an authorisation to give up tokens for satoshis. */
export interface Offer {
  /** Protocol tag, so an offer for another version cannot be replayed here. */
  version: string;
  /** Launch whose tokens are on sale. */
  launch: string;
  /** Maker's compressed public key, hex. Tokens come from this identity. */
  maker: string;
  /** Token atoms offered, decimal. */
  amount: string;
  /** Satoshis the taker must pay, decimal. */
  priceSats: string;
  /** Bitcoin address the payment must go to. Checked against the maker's own. */
  payTo: string;
  /** Bitcoin height after which the offer is void. */
  expiresAt: number;
  /** Random, so two identical offers are still distinguishable. */
  salt: string;
  /** Wall clock at authoring. Informational: no rule depends on it. */
  at: string;
}

export interface SignedOffer {
  offer: Offer;
  /** Compact 64-byte ECDSA over the offer digest, hex. */
  signature: string;
}

/** The taker's side: evidence that the offer's price was paid. */
export interface Fill {
  /** Digest of the offer this payment settles. */
  offerId: string;
  /** Bitcoin txid of the payment. */
  txid: string;
  /** Taker's identity, which the transfer record must name as recipient. */
  taker: string;
  /** Satoshis actually paid. */
  paidSats: number;
  at: string;
}

/** How an offer stands right now. Ordered by how much is still owed to trust. */
export type OfferStatus =
  /** Signed, unexpired, unpaid. Nothing is at risk. */
  | "open"
  /** Expired without a fill. Void. */
  | "expired"
  /** Paid, awaiting the maker's transfer. The taker is exposed. */
  | "awaiting-transfer"
  /** Paid and the transfer is on the chain. Done. */
  | "settled"
  /** The signature does not verify, or the offer contradicts itself. */
  | "invalid";

export interface OfferView {
  signed: SignedOffer;
  id: string;
  status: OfferStatus;
  /** Why it is invalid, when it is. */
  fault?: string;
  fill?: Fill;
  /** Satoshis per whole token, for a comparable column. */
  unitPrice: number;
}

export class MarketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketError";
  }
}

export const OFFER_VERSION = "btcfun/offer/1";
