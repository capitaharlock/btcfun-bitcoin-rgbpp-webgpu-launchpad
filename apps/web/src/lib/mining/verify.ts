/* Independent recomputation of a mining candidate.
 *
 * One function, three callers: the Proof Explorer's client-side recheck, the
 * ledger's claim validation, and the session's own self-check on GPU results.
 * That last one matters — a WGSL kernel is compiled by the driver, so a shader
 * that is correct on one machine is not thereby correct on every machine. Every
 * candidate the GPU proposes is re-hashed by the dependency-free CPU
 * implementation before anything downstream believes it.
 */

import { clz256, sha256d, wordsToHex } from "../sha256";
import { PREIMAGE_BYTES, type Candidate } from "./types";

/** One past the largest nonce the 64-bit field can hold. */
export const NONCE_LIMIT = 1n << 64n;

/**
 * Build the canonical preimage: `challenge32 || nonce_le64` (PROTOCOL.md §4.2).
 *
 * Both inputs are range-checked rather than truncated. A 33-byte challenge
 * silently ignoring its last byte, or nonces 0 and 2^64 producing the same
 * digest, would mean a record's signed fields no longer determine the work it
 * proves — two different signed claims for one piece of work. Canonical means
 * one representation, so anything else is refused here.
 */
export function preimage(challenge: Uint8Array, nonce: bigint): Uint8Array {
  if (challenge.length !== 32) {
    throw new RangeError(`challenge must be exactly 32 bytes, got ${challenge.length}`);
  }
  if (nonce < 0n || nonce >= NONCE_LIMIT) {
    throw new RangeError(`nonce must be in [0, 2^64), got ${nonce}`);
  }
  const buf = new Uint8Array(PREIMAGE_BYTES);
  buf.set(challenge, 0);
  let n = nonce;
  for (let i = 0; i < 8; i++) {
    buf[32 + i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return buf;
}

/** Recompute a candidate from scratch. Never trusts a reported digest. */
export function recompute(challenge: Uint8Array, nonce: bigint): Candidate {
  const digest = new Uint32Array(8);
  sha256d(preimage(challenge, nonce), digest);
  return { nonce, clz: clz256(digest), hash: wordsToHex(digest) };
}

/** True when a reported candidate survives independent recomputation.
 *
 *  Returns false rather than throwing on an out-of-range nonce: this is the
 *  boundary where untrusted candidates arrive, and "does not verify" is the
 *  honest answer for every reason it might not. */
export function verifyCandidate(challenge: Uint8Array, candidate: Candidate): boolean {
  try {
    const truth = recompute(challenge, candidate.nonce);
    return truth.hash === candidate.hash && truth.clz === candidate.clz;
  } catch {
    return false;
  }
}
