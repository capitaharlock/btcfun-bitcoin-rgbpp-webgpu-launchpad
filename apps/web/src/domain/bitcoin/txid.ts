/* Bitcoin transaction ids, in the two byte orders they come in.
 *
 * A txid is the double SHA-256 of the transaction without witness data.
 * Bitcoin hashes and serialises it in that digest's own byte order ("internal"),
 * but explorers, wallets and every API print it reversed ("displayed"). Seals,
 * challenges, miner cells and certificates all cross between the two, and a
 * single reversal missed is a valid-looking id for a transaction that does not
 * exist — so the crossing lives here once. Everywhere else a txid string is in
 * displayed order.
 */

import { sha256 } from "@noble/hashes/sha2";

import { bytesToHex, hexToBytes, type Bytes } from "@/domain/codec";

/** A txid as it is displayed: 64 lowercase hex characters. */
export const TXID_PATTERN = /^[0-9a-f]{64}$/;

/** The 32 bytes Bitcoin hashes for a displayed txid. Throws on anything that is not one. */
export function txidToInternal(txid: string): Bytes {
  if (!TXID_PATTERN.test(txid)) throw new RangeError("a txid is 64 lowercase hex characters");
  return hexToBytes(txid).reverse();
}

/** The displayed txid for 32 bytes in internal order. */
export function txidFromInternal(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new RangeError(`a txid is 32 bytes, got ${bytes.length}`);
  return bytesToHex(Uint8Array.from(bytes).reverse());
}

/** A Bitcoin txid as explorers show it, from the transaction without witness data. */
export function displayTxid(stripped: Uint8Array): string {
  return txidFromInternal(sha256(sha256(stripped)));
}
