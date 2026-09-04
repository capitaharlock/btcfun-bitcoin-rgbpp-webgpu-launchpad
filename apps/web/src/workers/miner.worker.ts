/* CPU mining worker.
 *
 * Grinds `sha256d(challenge32 || nonce_le64)` — PROTOCOL.md §4.2 — over the
 * nonce range assigned to its lane, and reports deltas the session accumulates.
 *
 * The lane owns the high 32 bits of the nonce and sweeps the low 32, so lanes
 * never collide and the hot loop needs no bigint arithmetic or modular stride.
 * Reports carry improvements rather than a running best, so the controller can
 * merge several lanes without re-deriving anything.
 */

import { sha256d, clz256, wordsToHex } from "../lib/sha256";
import { PREIMAGE_BYTES } from "../lib/mining/types";

export interface StartMsg {
  type: "start";
  /** 32-byte challenge digest. */
  challenge: Uint8Array;
  /** High 32 bits of every nonce this worker tries. Unique per worker. */
  lane: number;
}

export interface StopMsg {
  type: "stop";
}

/** A candidate, flattened: the worker boundary is not the place for bigint. */
export interface WorkerCandidate {
  nonceLo: number;
  nonceHi: number;
  clz: number;
  hash: string;
}

export interface ProgressMsg {
  type: "progress";
  /** Attempts since the previous message. */
  hashes: number;
  improvements: WorkerCandidate[];
  current: string;
}

/** Attempts between clock checks. Large enough that `performance.now()` is
 *  noise, small enough that a stop request is honoured within a few ms. */
const CHUNK = 8192;

/** Minimum gap between progress messages. The UI repaints at frame rate; more
 *  traffic than this only costs structured-clone time. */
const REPORT_MS = 90;

let running = false;

self.onmessage = (ev: MessageEvent<StartMsg | StopMsg>) => {
  const msg = ev.data;

  if (msg.type === "stop") {
    running = false;
    return;
  }

  if (msg.type !== "start") return;

  running = true;
  grind(msg.challenge, msg.lane >>> 0);
};

function grind(challenge: Uint8Array, lane: number): void {
  const buf = new Uint8Array(PREIMAGE_BYTES);
  buf.set(challenge.subarray(0, 32), 0);
  // The lane occupies the nonce's high word for the whole run.
  buf[36] = lane & 0xff;
  buf[37] = (lane >>> 8) & 0xff;
  buf[38] = (lane >>> 16) & 0xff;
  buf[39] = (lane >>> 24) & 0xff;

  const digest = new Uint32Array(8);
  let nonceLo = 0;
  let bestClz = -1;
  let hashes = 0;
  let improvements: WorkerCandidate[] = [];
  let lastReport = performance.now();

  const step = (): void => {
    if (!running) return;

    for (let i = 0; i < CHUNK; i++) {
      buf[32] = nonceLo & 0xff;
      buf[33] = (nonceLo >>> 8) & 0xff;
      buf[34] = (nonceLo >>> 16) & 0xff;
      buf[35] = (nonceLo >>> 24) & 0xff;

      sha256d(buf, digest);
      const clz = clz256(digest);

      if (clz > bestClz) {
        bestClz = clz;
        improvements.push({ nonceLo, nonceHi: lane, clz, hash: wordsToHex(digest) });
      }

      nonceLo = (nonceLo + 1) >>> 0;
      hashes++;
    }

    const now = performance.now();
    if (now - lastReport >= REPORT_MS) {
      lastReport = now;
      const progress: ProgressMsg = {
        type: "progress",
        hashes,
        improvements,
        current: wordsToHex(digest),
      };
      self.postMessage(progress);
      hashes = 0;
      improvements = [];
    }

    // Yield to the event loop so a stop message is actually delivered.
    setTimeout(step, 0);
  };

  step();
}
