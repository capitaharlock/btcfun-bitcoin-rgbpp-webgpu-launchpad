/* Miner controller: fans work across workers and aggregates their reports.
 *
 * Backend policy is deliberately honest. The CPU path is real and measured.
 * WebGPU is detected and reported, but not claimed as implemented — see
 * `gpuSupport()`. Task V7 owns the GPU compute path and its verification.
 */

import type { ProgressMsg } from "../workers/miner.worker";

export type Backend = "cpu-workers" | "webgpu";

export interface MinerSample {
  hashes: number;
  hashRate: number;
  bestClz: number;
  bestNonce: number;
  bestHash: string;
  elapsedMs: number;
  workers: number;
  backend: Backend;
}

export interface GpuSupport {
  available: boolean;
  detail: string;
}

/** Detect WebGPU without pretending the compute path exists yet. */
export async function gpuSupport(): Promise<GpuSupport> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } };
  if (!nav.gpu) {
    return { available: false, detail: "navigator.gpu unavailable in this browser" };
  }
  try {
    const adapter = await nav.gpu.requestAdapter();
    return adapter
      ? { available: true, detail: "adapter present — compute path is V7 scope, not yet implemented" }
      : { available: false, detail: "no adapter returned" };
  } catch (err) {
    return { available: false, detail: `adapter request failed: ${String(err)}` };
  }
}

export class Miner {
  private workers: Worker[] = [];
  private stats: Array<{ hashes: number; bestClz: number; bestNonce: number; bestHash: string }> = [];
  private startedAt = 0;
  private raf = 0;

  constructor(
    private readonly onSample: (s: MinerSample) => void,
    private readonly workerCount = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)),
  ) {}

  get count(): number {
    return this.workerCount;
  }

  start(challenge: Uint8Array): void {
    this.stop();
    this.startedAt = performance.now();
    this.stats = [];

    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(new URL("../workers/miner.worker.ts", import.meta.url), {
        type: "module",
      });
      this.stats.push({ hashes: 0, bestClz: -1, bestNonce: 0, bestHash: "" });

      worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as ProgressMsg;
        if (msg.type !== "progress") return;
        const slot = this.stats[i];
        slot.hashes = msg.hashes;
        if (msg.bestClz > slot.bestClz) {
          slot.bestClz = msg.bestClz;
          slot.bestNonce = msg.bestNonce;
          slot.bestHash = msg.bestHash;
        }
      };

      worker.postMessage({
        type: "start",
        challenge,
        startNonce: i,
        stride: this.workerCount,
      });

      this.workers.push(worker);
    }

    const tick = () => {
      if (this.workers.length === 0) return;
      this.emit();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private emit(): void {
    let hashes = 0;
    let bestClz = -1;
    let bestNonce = 0;
    let bestHash = "";

    for (const s of this.stats) {
      hashes += s.hashes;
      if (s.bestClz > bestClz) {
        bestClz = s.bestClz;
        bestNonce = s.bestNonce;
        bestHash = s.bestHash;
      }
    }

    const elapsedMs = performance.now() - this.startedAt;
    this.onSample({
      hashes,
      hashRate: elapsedMs > 0 ? (hashes / elapsedMs) * 1000 : 0,
      bestClz,
      bestNonce,
      bestHash,
      elapsedMs,
      workers: this.workerCount,
      backend: "cpu-workers",
    });
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    for (const w of this.workers) {
      w.postMessage({ type: "stop" });
      w.terminate();
    }
    this.workers = [];
  }
}

/**
 * Expected best leading-zero count after `n` attempts.
 *
 * This is why hardware advantage is logarithmic rather than linear — but note
 * PROTOCOL.md §2 withdrew the "farm immunity" claim: ticket splitting and
 * timing strategies are separate vectors this figure does not cover.
 */
export function expectedClz(hashes: number): number {
  return hashes > 0 ? Math.log2(hashes) : 0;
}

/** Weight candidate from PROTOCOL.md §4.2: `clz^2`, still unadopted. */
export function weightOf(clz: number): number {
  return clz > 0 ? clz * clz : 0;
}
