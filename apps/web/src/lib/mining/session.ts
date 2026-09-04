/* Mining session: backend selection, aggregation and rate measurement.
 *
 * Everything that is true of *any* backend lives here, so `CpuBackend` and
 * `GpuBackend` only have to grind and report deltas. That includes the one
 * number people judge the miner by — the hash rate — which is measured over a
 * trailing window rather than since the start, because a session average hides
 * exactly what a visitor wants to see: the device throttling, a batch resize
 * settling, or the tab losing the GPU when it goes to the background.
 */

import { CpuBackend } from "./cpu-backend";
import { GpuBackend } from "./gpu-backend";
import { verifyCandidate } from "./verify";
import {
  EMPTY_SAMPLE,
  type BackendAvailability,
  type BackendKind,
  type Candidate,
  type MiningBackend,
  type MiningSample,
} from "./types";

export type BackendChoice = "auto" | BackendKind;

/** Trailing window for the rate estimate. */
const WINDOW_MS = 2000;

export interface SessionCallbacks {
  /** Called at frame rate while mining, with the aggregate state. */
  onSample: (sample: MiningSample) => void;
  /** Called once per candidate that beats everything seen this session. */
  onImprovement?: (candidate: Candidate) => void;
  /** Called when the requested backend could not be used and CPU took over. */
  onFallback?: (reason: string) => void;
}

/** One point in the rate window: wall clock and cumulative attempts. */
interface RatePoint {
  t: number;
  hashes: number;
}

export class MiningSession {
  private backend: MiningBackend | null = null;
  private sample: MiningSample = EMPTY_SAMPLE;
  private window: RatePoint[] = [];
  private startedAt = 0;
  private frame = 0;
  private dirty = false;

  constructor(private readonly callbacks: SessionCallbacks) {}

  /** What each backend reports about itself, for the UI to show before a run. */
  static async probe(): Promise<BackendAvailability[]> {
    return [CpuBackend.probe(), await GpuBackend.probe()];
  }

  get running(): boolean {
    return this.backend !== null;
  }

  async start(challenge: Uint8Array, choice: BackendChoice = "auto"): Promise<void> {
    this.stop();

    const backend = await this.select(choice);
    this.backend = backend;
    this.startedAt = performance.now();
    this.window = [{ t: this.startedAt, hashes: 0 }];
    this.sample = { ...EMPTY_SAMPLE, backend: backend.kind, lanes: backend.lanes };

    await backend.start(challenge, (progress) => {
      const hashes = this.sample.hashes + progress.hashes;
      let best = this.sample.best;

      for (const candidate of progress.improvements) {
        if (candidate.clz <= (best?.clz ?? -1)) continue;
        // Re-hash on the CPU before believing any backend. A driver-compiled
        // kernel that is correct here may not be correct on the visitor's
        // machine, and a wrong candidate must never reach the ledger.
        if (!verifyCandidate(challenge, candidate)) {
          this.reject(candidate.nonce);
          return;
        }
        best = candidate;
        this.callbacks.onImprovement?.(candidate);
      }

      const now = performance.now();
      this.window.push({ t: now, hashes });
      while (this.window.length > 2 && now - this.window[0].t > WINDOW_MS) this.window.shift();

      this.sample = {
        backend: backend.kind,
        hashes,
        hashRate: this.rate(now),
        elapsedMs: now - this.startedAt,
        lanes: backend.lanes,
        best,
        current: progress.current,
      };
      this.dirty = true;
    });

    // Repaint on frames rather than on reports: the CPU backend reports ~11
    // times a second per lane and the GPU ~22, and neither cadence is the
    // display's. Coalescing here keeps React re-renders at one per frame.
    const tick = (): void => {
      if (!this.backend) return;
      if (this.dirty) {
        this.dirty = false;
        this.callbacks.onSample(this.sample);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** A backend that reports a digest it did not produce is not trustworthy for
   *  anything else either, so the run ends rather than degrading quietly. */
  private reject(nonce: bigint): void {
    const kind = this.backend?.kind ?? "unknown";
    this.stop();
    this.callbacks.onFallback?.(
      `${kind} backend reported a digest that failed recomputation at nonce ${nonce} — mining stopped`,
    );
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.backend?.stop();
    this.backend = null;
    this.dirty = false;
  }

  /** Attempts per second over the trailing window, 0 until it has two points. */
  private rate(now: number): number {
    const first = this.window[0];
    const last = this.window[this.window.length - 1];
    const span = last.t - first.t;
    if (span <= 0) return now > this.startedAt ? (last.hashes / (now - this.startedAt)) * 1000 : 0;
    return ((last.hashes - first.hashes) / span) * 1000;
  }

  /**
   * Pick a backend. "auto" prefers the GPU and silently falls back to workers,
   * because a visitor without WebGPU should still be able to mine — but the
   * reason is reported so the UI can say which device is actually running
   * rather than leaving a GPU badge lit over CPU numbers.
   */
  private async select(choice: BackendChoice): Promise<MiningBackend> {
    if (choice === "cpu") return new CpuBackend();
    try {
      return await GpuBackend.create();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (choice === "gpu") this.callbacks.onFallback?.(reason);
      else this.callbacks.onFallback?.(`${reason} — using worker threads`);
      return new CpuBackend();
    }
  }
}
