/* CPU miner worker.
 *
 * Grinds `sha256d(challenge32 || nonce_le64)` and reports the best candidate by
 * leading zero bits. This is the measurement harness behind task V7 ("PoW
 * verification and browser feasibility measurements") — the numbers it reports
 * are real, not simulated.
 */

import { sha256d, clz256, wordsToHex } from "../lib/sha256";

export interface StartMsg {
  type: "start";
  /** 32-byte challenge digest. */
  challenge: Uint8Array;
  /** Starting nonce, so multiple workers can cover disjoint ranges. */
  startNonce: number;
  /** Nonce stride, normally the number of workers. */
  stride: number;
}

export interface ProgressMsg {
  type: "progress";
  hashes: number;
  bestClz: number;
  bestNonce: number;
  bestHash: string;
  elapsedMs: number;
}

const BATCH = 20_000;

let running = false;
const out = new Uint32Array(8);

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as StartMsg | { type: "stop" };

  if (msg.type === "stop") {
    running = false;
    return;
  }

  if (msg.type !== "start") return;

  const challenge = msg.challenge;
  const buf = new Uint8Array(40);
  buf.set(challenge.subarray(0, 32), 0);

  let nonce = msg.startNonce >>> 0;
  const stride = Math.max(1, msg.stride | 0);

  let bestClz = -1;
  let bestNonce = 0;
  let bestHash = "";
  let hashes = 0;
  const t0 = performance.now();
  let lastReport = t0;

  running = true;

  const step = () => {
    if (!running) return;

    for (let i = 0; i < BATCH; i++) {
      // little-endian 64-bit nonce; the high word stays zero in this range
      buf[32] = nonce & 0xff;
      buf[33] = (nonce >>> 8) & 0xff;
      buf[34] = (nonce >>> 16) & 0xff;
      buf[35] = (nonce >>> 24) & 0xff;

      sha256d(buf, out);
      const z = clz256(out);

      if (z > bestClz) {
        bestClz = z;
        bestNonce = nonce;
        bestHash = wordsToHex(out);
      }

      nonce = (nonce + stride) >>> 0;
      hashes++;
    }

    const now = performance.now();
    if (now - lastReport >= 200) {
      lastReport = now;
      const progress: ProgressMsg = {
        type: "progress",
        hashes,
        bestClz,
        bestNonce,
        bestHash,
        elapsedMs: now - t0,
      };
      self.postMessage(progress);
    }

    // Yield so the worker stays responsive to `stop`.
    setTimeout(step, 0);
  };

  step();
};
