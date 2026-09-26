/* CPU mining worker.
 *
 * Grinds `sha256d(challenge32 || nonce_le64)` — PROTOCOL.md §4.2 — over the
 * nonce range assigned to its lane, and reports deltas the session accumulates.
 *
 * A lane tries `first`, `first + stride`, `first + 2·stride`, … with the
 * 64-bit nonce carried as two u32 words, so the hot loop needs no bigint. With
 * one lane per residue modulo `stride`, lanes never collide and the tried
 * nonces stay a prefix of the sweep, which is what lets a paused search resume
 * from a single number (`domain/mining/progress.ts`). Reports carry improvements
 * rather than a running best, so the controller can merge several lanes
 * without re-deriving anything.
 */

import { sha256d, clz256, wordsToHex } from "@/domain/codec";
import { PREIMAGE_BYTES } from "@/domain/mining";

export interface StartMsg {
  type: "start";
  /** 32-byte challenge digest. */
  challenge: Uint8Array;
  /** Low and high u32 words of the first nonce this worker tries. */
  firstLo: number;
  firstHi: number;
  /** Distance between consecutive nonces of this worker: the number of lanes. */
  stride: number;
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
  grind(msg.challenge, msg.firstLo >>> 0, msg.firstHi >>> 0, Math.max(1, msg.stride >>> 0));
};

function writeHigh(buf: Uint8Array, hi: number): void {
  buf[36] = hi & 0xff;
  buf[37] = (hi >>> 8) & 0xff;
  buf[38] = (hi >>> 16) & 0xff;
  buf[39] = (hi >>> 24) & 0xff;
}

function grind(challenge: Uint8Array, firstLo: number, firstHi: number, stride: number): void {
  const buf = new Uint8Array(PREIMAGE_BYTES);
  buf.set(challenge.subarray(0, 32), 0);
  // The high word changes once per 2^32 / stride attempts, so it is written
  // only then rather than on every hash.
  let nonceHi = firstHi;
  writeHigh(buf, nonceHi);

  const digest = new Uint32Array(8);
  let nonceLo = firstLo;
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
        improvements.push({ nonceLo, nonceHi, clz, hash: wordsToHex(digest) });
      }

      // Plain numbers up to 2^32 + stride are exact, so the carry is a compare.
      nonceLo += stride;
      if (nonceLo > 0xffffffff) {
        nonceLo -= 0x100000000;
        nonceHi = (nonceHi + 1) >>> 0;
        writeHigh(buf, nonceHi);
      }
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
