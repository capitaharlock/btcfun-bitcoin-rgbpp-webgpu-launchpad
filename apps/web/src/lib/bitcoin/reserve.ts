/* Where a ticket payment goes.
 *
 * In this prototype: nowhere recoverable. The address is a witness-v0 program
 * whose 20 bytes are a domain-separated hash of the launch id, so it is
 * deterministic, independently derivable by anyone, and has no known private
 * key — the satoshis are burned.
 *
 * That is a deliberate choice over the two alternatives. An operator-held
 * address would make the reserve custodial, which is exactly the trust
 * assumption PROTOCOL.md §2 refuses to paper over; a shared key published in
 * the client would let anyone drain it and make the "reserve" a fiction.
 * Burning is honest: the payment is real, verifiable on an explorer and bound
 * to the launch, and nobody — including us — can spend it.
 *
 * A redeemable reserve needs the CKB-side asset and script enforcement from
 * task `V3`. Until then the UI states that tickets are not refundable, and the
 * Proof Explorer lists redemption as not implemented.
 */

import { Address } from "@scure/btc-signer";
import { sha256 } from "@noble/hashes/sha2";

import { ACTIVE, type NetworkConfig } from "./network";

/** Domain separation, so this hash cannot collide with any other use. */
const LABEL = "btc.fun/reserve/v1/";

/** The sink address for a launch's tickets. */
export function reserveAddress(launchId: string, network: NetworkConfig = ACTIVE): string {
  const hash = sha256(new TextEncoder().encode(LABEL + launchId)).slice(0, 20);
  // A P2WPKH program is normally HASH160 of a public key. This one is a hash of
  // a string, so no key maps to it and the output is unspendable by anyone.
  return Address(network.params).encode({ type: "wpkh", hash });
}

/** True if `address` is the sink for this launch. Used when checking a ticket. */
export function isReserveAddress(
  address: string,
  launchId: string,
  network: NetworkConfig = ACTIVE,
): boolean {
  return address === reserveAddress(launchId, network);
}
