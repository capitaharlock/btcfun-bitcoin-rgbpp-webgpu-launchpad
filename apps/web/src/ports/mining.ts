/* A device that can grind a challenge, and the set of devices a browser has.
 *
 * Both backends hash the same preimage — `sha256d(challenge32 || nonce_le64)`,
 * PROTOCOL.md §4.2 — and report the same shape, so the session, the UI and the
 * verifier never branch on which device produced a candidate. The CPU workers
 * and the WebGPU kernel are the two implementations; a third (compute on a
 * worker, a native miner behind a socket) or a test's fake backend joins by
 * implementing this and nothing else. The candidate itself is domain
 * (`domain/mining/types.ts`): what a backend finds is reproducible from
 * `(challenge, nonce)` alone, whichever device found it.
 */

import type { BackendKind, Candidate } from "@/domain/mining";

/** One report from a backend. Counts are deltas; the session accumulates. */
export interface BackendProgress {
  /** Attempts completed since the previous report. */
  hashes: number;
  /** Candidates that beat the backend's running best, oldest first. */
  improvements: Candidate[];
  /** An arbitrary recent digest, for the live readout. Never null once running. */
  current: string;
  /** Every nonce from the run's start up to this one (exclusive) has been tried. Absolute, not a delta. */
  frontier: bigint;
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

  /**
   * Begin grinding from nonce `from` upwards. Resolves when the loop has been
   * set up, not when it ends. Starting anywhere but 0 is how a paused or
   * reloaded search resumes (`domain/mining/progress.ts`).
   */
  start(challenge: Uint8Array, from: bigint, onProgress: (p: BackendProgress) => void): Promise<void>;

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

/**
 * How a session obtains a backend.
 *
 * The session decides *which* backend to run and what to do when one is
 * unavailable; it does not need to know how either is constructed. Keeping the
 * constructors behind this means the fallback policy is testable without a
 * GPU, and a new backend slots in without touching the aggregation, the rate
 * window or the self-check.
 */
export interface MiningBackends {
  cpu(): MiningBackend;
  /** Rejects when the GPU is unusable; the session then falls back to `cpu`. */
  gpu(): Promise<MiningBackend>;
  /** What each backend says about itself, for the UI to show before a run. */
  probe(): Promise<BackendAvailability[]>;
}
