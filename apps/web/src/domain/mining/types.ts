/* What mining produces, whichever device produced it.
 *
 * A candidate is reproducible from `(challenge, nonce)` alone by `verify.ts`,
 * which is what makes the Proof Explorer's client-side recheck possible for
 * either backend, and why nothing here says how a candidate was found. The
 * device interface itself is a port (`ports/mining.ts`): the domain only names
 * the two kinds so a sample can say which one it came from.
 */

/** Length of the preimage the backends hash: 32-byte digest + 8-byte nonce. */
export const PREIMAGE_BYTES = 40;

export type BackendKind = "cpu" | "gpu";

/** A hash attempt worth keeping: the nonce, its digest and its leading zeros. */
export interface Candidate {
  /** Full 64-bit nonce. Kept as bigint because the GPU exhausts 2^32 in seconds. */
  nonce: bigint;
  /** Leading zero bits of the digest. The §4.2 weight candidate is `clz²`. */
  clz: number;
  /** Digest as 64 lowercase hex characters. */
  hash: string;
}

/** Aggregated state the UI renders. Produced by `app/mining/session.ts`. */
export interface MiningSample {
  backend: BackendKind;
  /** Total attempts this session. */
  hashes: number;
  /** Every nonce below this has been tried, counting runs this one resumed. */
  frontier: bigint;
  /** Attempts per second over a trailing window, so it reacts to throttling. */
  hashRate: number;
  elapsedMs: number;
  lanes: number;
  best: Candidate | null;
  /** Recent digest, refreshed every report — this is what "looks fast". */
  current: string;
}

export const EMPTY_SAMPLE: MiningSample = {
  backend: "cpu",
  hashes: 0,
  frontier: 0n,
  hashRate: 0,
  elapsedMs: 0,
  lanes: 0,
  best: null,
  current: "",
};
