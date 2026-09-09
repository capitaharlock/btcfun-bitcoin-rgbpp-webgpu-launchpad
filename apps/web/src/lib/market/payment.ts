/* The payment leg of a sale, read from the chain rather than from anyone's word.
 *
 * A buyer pays the maker's address with an OP_RETURN that names two things:
 * the offer, and the buyer. Naming the offer is what stops a payment of the
 * right size from being claimed against the wrong sale. Naming the buyer is what
 * stops everyone else: without it, anyone watching the chain could see the
 * payment, tell the maker "that was me", and have the tokens delivered to them.
 * With it, the chain itself says who is owed, and the maker's page needs nothing
 * from the buyer but the payment — which it finds on its own, by reading its own
 * address.
 *
 *   OP_RETURN  "btcfun:f2:" ‖ offer id [16 bytes] ‖ buyer public key [33 bytes]
 *
 * 59 bytes, inside the 80-byte relay limit. Half the offer digest is far beyond
 * what anyone could grind a collision for in the life of an offer; the buyer's
 * key is carried whole, because it is where the tokens go.
 */

import type { ChainTx } from "../bitcoin";
import { bytesToHex, hexToBytes } from "../bytes";
import { IDENTITY_PATTERN } from "../canonical";
import { checkFill, offerId } from "./offers";
import type { Fill, SignedOffer } from "./types";

const TAG = new TextEncoder().encode("btcfun:f2:");
const OFFER_BYTES = 16;
const TAKER_BYTES = 33;
export const FILL_MEMO_BYTES = TAG.length + OFFER_BYTES + TAKER_BYTES;

/** The OP_RETURN payload binding a payment to an offer and a buyer. */
export function fillMemo(id: string, taker: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(id)) throw new RangeError("offer id must be 64 hex characters");
  if (!IDENTITY_PATTERN.test(taker)) throw new RangeError("taker must be a compressed public key");
  const out = new Uint8Array(FILL_MEMO_BYTES);
  out.set(TAG, 0);
  out.set(hexToBytes(id.slice(0, OFFER_BYTES * 2)), TAG.length);
  out.set(hexToBytes(taker), TAG.length + OFFER_BYTES);
  return out;
}

export interface FillMemo {
  /** First half of the offer digest, hex. */
  offerPrefix: string;
  /** The buyer's compressed public key, hex. */
  taker: string;
}

/** Decode a fill memo, or null when the bytes are not one. */
export function readFillMemo(bytes: Uint8Array): FillMemo | null {
  if (bytes.length !== FILL_MEMO_BYTES) return null;
  for (let i = 0; i < TAG.length; i++) if (bytes[i] !== TAG[i]) return null;
  const offerPrefix = bytesToHex(bytes.subarray(TAG.length, TAG.length + OFFER_BYTES));
  const taker = bytesToHex(bytes.subarray(TAG.length + OFFER_BYTES));
  return IDENTITY_PATTERN.test(taker) ? { offerPrefix, taker } : null;
}

/** The data an OP_RETURN script pushes, or null for any other script. */
export function opReturnData(scriptHex: string): Uint8Array | null {
  if (!scriptHex.startsWith("6a")) return null;
  const script = hexToBytes(scriptHex);
  if (script.length < 2) return null;
  const op = script[1];
  // A direct push (1–75 bytes) or PUSHDATA1; nothing this app writes is larger.
  const [start, length] = op === 0x4c ? [3, script[2]] : op >= 1 && op <= 75 ? [2, op] : [0, -1];
  if (length < 0 || start + length !== script.length) return null;
  return script.subarray(start, start + length);
}

/** A payment's memo, if the transaction carries a fill memo at all. */
function memoOf(tx: ChainTx): FillMemo | null {
  for (const out of tx.outputs) {
    const data = opReturnData(out.script);
    const memo = data && readFillMemo(data);
    if (memo) return memo;
  }
  return null;
}

/**
 * The fill this transaction constitutes for this offer, or why it is not one.
 *
 * Everything comes from the chain: the buyer from the memo, the amount from the
 * output that pays the maker. The only input from the offer is what it promised.
 */
export function fillFromTx(tx: ChainTx, signed: SignedOffer): Fill | { fault: string } {
  const id = offerId(signed.offer);
  const memo = memoOf(tx);
  if (!memo) return { fault: "That transaction carries no btc.fun payment memo." };
  if (!id.startsWith(memo.offerPrefix)) return { fault: "That payment is for a different offer." };

  const paid = tx.outputs
    .filter((o) => o.address === signed.offer.payTo)
    .reduce((sum, o) => sum + o.value, 0);
  if (paid === 0) return { fault: "That transaction pays nothing to the offer's address." };

  const fill: Fill = {
    offerId: id,
    txid: tx.txid,
    taker: memo.taker,
    paidSats: paid,
    at: tx.confirmed ? "confirmed" : "unconfirmed",
  };
  const fault = checkFill(fill, signed);
  return fault ? { fault } : fill;
}

/**
 * Every offer in `offers` that one of `txs` validly paid, keyed by offer id.
 *
 * The first valid payment wins; a second payment for an already-paid offer is
 * the buyer's mistake to take up with the maker, not a second sale.
 */
export function fillsIn(txs: readonly ChainTx[], offers: readonly SignedOffer[]): Map<string, Fill> {
  const byPrefix = new Map<string, SignedOffer>();
  for (const signed of offers) byPrefix.set(offerId(signed.offer).slice(0, OFFER_BYTES * 2), signed);

  const fills = new Map<string, Fill>();
  // Oldest first, so "first valid payment" means first on chain.
  for (const tx of [...txs].reverse()) {
    const memo = memoOf(tx);
    const signed = memo && byPrefix.get(memo.offerPrefix);
    if (!signed) continue;
    const result = fillFromTx(tx, signed);
    if ("fault" in result || fills.has(result.offerId)) continue;
    fills.set(result.offerId, result);
  }
  return fills;
}
