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

/** Build the canonical preimage: `challenge32 || nonce_le64` (PROTOCOL.md §4.2). */
export function preimage(challenge: Uint8Array, nonce: bigint): Uint8Array {
  if (challenge.length < 32) throw new RangeError("challenge must be 32 bytes");
  const buf = new Uint8Array(PREIMAGE_BYTES);
  buf.set(challenge.subarray(0, 32), 0);
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

/** True when a reported candidate survives independent recomputation. */
export function verifyCandidate(challenge: Uint8Array, candidate: Candidate): boolean {
  const truth = recompute(challenge, candidate.nonce);
  return truth.hash === candidate.hash && truth.clz === candidate.clz;
}
