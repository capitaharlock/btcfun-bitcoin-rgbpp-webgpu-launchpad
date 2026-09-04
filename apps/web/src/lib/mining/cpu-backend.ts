/* CPU mining backend: one worker per lane, merged behind the mining port.
 *
 * This path is always available, so it is also the fallback whenever WebGPU is
 * missing or the device is lost. It exists as much for measurement as for
 * mining: task V7 needs a real number for what an ordinary visitor's machine
 * can do without a GPU, and an estimate would not be evidence.
 */

import type { BackendAvailability, BackendProgress, Candidate, MiningBackend } from "./types";
import type { ProgressMsg, StartMsg, WorkerCandidate } from "../../workers/miner.worker";

/** Leave one core for the UI thread; a pegged main thread reads as a hang. */
function defaultLanes(): number {
  return Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1));
}

export class CpuBackend implements MiningBackend {
  readonly kind = "cpu" as const;

  private workers: Worker[] = [];
  private best: Candidate | null = null;

  constructor(readonly lanes: number = defaultLanes()) {}

  static probe(): BackendAvailability {
    const cores = navigator.hardwareConcurrency || 4;
    return { kind: "cpu", available: true, detail: `${cores} logical cores reported` };
  }

  describe(): string {
    return `${this.lanes} worker ${this.lanes === 1 ? "thread" : "threads"}`;
  }

  async start(challenge: Uint8Array, onProgress: (p: BackendProgress) => void): Promise<void> {
    if (challenge.length < 32) throw new RangeError("challenge must be 32 bytes");
    this.stop();
    this.best = null;

    for (let lane = 0; lane < this.lanes; lane++) {
      const worker = new Worker(new URL("../../workers/miner.worker.ts", import.meta.url), {
        type: "module",
        name: `miner-${lane}`,
      });

      worker.onmessage = (ev: MessageEvent<ProgressMsg>) => {
        const msg = ev.data;
        if (msg.type !== "progress") return;
        onProgress({
          hashes: msg.hashes,
          improvements: this.merge(msg.improvements),
          current: msg.current,
        });
      };

      const start: StartMsg = { type: "start", challenge, lane };
      worker.postMessage(start);
      this.workers.push(worker);
    }
  }

  /**
   * Keep only what beats the best across all lanes.
   *
   * Each worker reports improvements relative to its own history, so a lane
   * that starts late will re-announce candidates the session already beat.
   * Filtering here — rather than in every consumer — is what lets the UI treat
   * the improvement stream as monotone.
   */
  private merge(reported: WorkerCandidate[]): Candidate[] {
    const kept: Candidate[] = [];
    for (const c of reported) {
      if (c.clz <= (this.best?.clz ?? -1)) continue;
      const candidate: Candidate = {
        nonce: (BigInt(c.nonceHi) << 32n) | BigInt(c.nonceLo),
        clz: c.clz,
        hash: c.hash,
      };
      this.best = candidate;
      kept.push(candidate);
    }
    return kept;
  }

  stop(): void {
    for (const worker of this.workers) {
      worker.onmessage = null;
      worker.postMessage({ type: "stop" });
      worker.terminate();
    }
    this.workers = [];
  }
}
