/* Mining port.
 *
 * Both backends grind the same preimage — `sha256d(challenge32 || nonce_le64)`,
 * PROTOCOL.md §4.2 — and report the same shape, so the session layer, the UI and
 * the verifier never branch on which device produced a candidate. A candidate is
 * reproducible from `(challenge, nonce)` alone by `lib/sha256`, which is what
 * makes the Proof Explorer's client-side recheck possible for either backend.
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

/** One report from a backend. Counts are deltas; the session accumulates. */
export interface BackendProgress {
  /** Attempts completed since the previous report. */
  hashes: number;
  /** Candidates that beat the backend's running best, oldest first. */
  improvements: Candidate[];
  /** An arbitrary recent digest, for the live readout. Never null once running. */
  current: string;
}

/**
 * A device that can grind a challenge.
 *
 * Implementations own their own scheduling and must return from `stop()` with no
 * further `onProgress` calls pending, so a view can swap backends without
 * leaking work.
 */
export interface MiningBackend {
  readonly kind: BackendKind;

  /** Short human description of the device and its parallelism, for the UI. */
  describe(): string;

  /** How many parallel lanes are grinding (workers, or shader invocations). */
  readonly lanes: number;

  /** Begin grinding. Resolves when the loop has been set up, not when it ends. */
  start(challenge: Uint8Array, onProgress: (p: BackendProgress) => void): Promise<void>;

  /** Stop grinding and release device resources. Safe to call when not started. */
  stop(): void;
}

/** What a backend's factory reports before anyone commits to using it. */
export interface BackendAvailability {
  kind: BackendKind;
  available: boolean;
  /** Why it is or is not available, shown verbatim in the UI. */
  detail: string;
}

/** Aggregated state the UI renders. Produced by `MiningSession`. */
export interface MiningSample {
  backend: BackendKind;
  /** Total attempts this session. */
  hashes: number;
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
  hashRate: 0,
  elapsedMs: 0,
  lanes: 0,
  best: null,
  current: "",
};
