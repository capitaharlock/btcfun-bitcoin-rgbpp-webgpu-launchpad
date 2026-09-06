/* secp256k1 signing and verification primitives.
 *
 * Extracted from the wallet so that *verifying* costs nothing but the curve.
 * The activity index runs in a Cloudflare Worker and has to check signatures on
 * every write; importing the wallet there would drag BIP39 wordlists, BIP32 and
 * a transaction builder into a bundle that needs none of them — and would mean
 * two copies of the verification logic, which is how a server ends up accepting
 * what a client rejects.
 *
 * Compact 64-byte ECDSA over a 32-byte digest, the same curve and encoding
 * Bitcoin uses, so one signature format covers a transaction input, a ledger
 * record, a market offer and an activity event.
 */

import { secp256k1 } from "@noble/curves/secp256k1";

/** Sign a 32-byte digest. The caller hashes; this never hashes for you. */
export function signDigestWith(privateKey: Uint8Array, digest: Uint8Array): Uint8Array {
  if (digest.length !== 32) throw new RangeError("signDigestWith: expected a 32-byte digest");
  return secp256k1.sign(digest, privateKey).toCompactRawBytes();
}

/**
 * Verify a compact signature against a compressed public key.
 *
 * Never throws. Malformed input is a failed verification, not an exception:
 * every caller is checking untrusted bytes, and each of them wrapping this in
 * a try/catch is the same mistake repeated.
 */
export function verifySignature(
  publicKey: Uint8Array,
  digest: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    return secp256k1.verify(signature, digest, publicKey);
  } catch {
    return false;
  }
}
