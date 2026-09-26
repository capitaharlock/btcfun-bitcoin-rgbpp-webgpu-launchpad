/* Mining session: backend selection, aggregation and rate measurement.
 *
 * Everything that is true of *any* backend lives here, so `CpuBackend` and
 * `GpuBackend` only have to grind and report deltas. That includes the one
 * number people judge the miner by — the hash rate — which is measured over a
 * trailing window rather than since the start, because a session average hides
 * exactly what a visitor wants to see: the device throttling, a batch resize
 * settling, or the tab losing the GPU when it goes to the background.
 */

import { verifyCandidate } from "@/domain/mining";
import { EMPTY_SAMPLE, type BackendKind, type Candidate, type MiningSample } from "@/domain/mining";
import type { MiningBackend, MiningBackends } from "@/ports";

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

  /**
   * Which run the session is on.
   *
   * Starting a backend is asynchronous — `GpuBackend.create` requests an
   * adapter and compiles a shader — and anything can happen during that await:
   * the visitor navigates away, cancels, or starts a different challenge. The
   * generation is bumped by every `start` and every `stop`, and each await
   * re-checks it before taking ownership of what it built. Without that, a
   * backend created for a run that no longer exists was published anyway and
   * kept grinding after the visitor had stopped it.
   */
  private generation = 0;

  /** The devices come from the port (`ports/mining.ts`): the session never constructs one itself. */
  constructor(
    private readonly callbacks: SessionCallbacks,
    private readonly ports: MiningBackends,
  ) {}

  get running(): boolean {
    return this.backend !== null;
  }

  /**
   * Grind `challenge` from nonce `from`. A resumed search passes where the last
   * run stopped, so pausing and reloading never repeat or reorder the sweep.
   */
  async start(challenge: Uint8Array, choice: BackendChoice = "auto", from = 0n): Promise<void> {
    this.stop();
    const run = ++this.generation;

    const backend = await this.select(choice);
    // Cancelled while the adapter was being acquired: discard what was built
    // rather than publishing it. Tearing it down here is the only chance —
    // nothing else holds a reference to it.
    if (run !== this.generation) {
      backend.stop();
      return;
    }

    this.backend = backend;
    this.startedAt = performance.now();
    this.window = [{ t: this.startedAt, hashes: 0 }];
    this.sample = { ...EMPTY_SAMPLE, backend: backend.kind, lanes: backend.lanes, frontier: from };

    await backend.start(challenge, from, (progress) => {
      // Reports can outlive the run that asked for them: a worker message or a
      // GPU readback already in flight arrives after stop().
      if (run !== this.generation) return;

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
        frontier: progress.frontier > this.sample.frontier ? progress.frontier : this.sample.frontier,
        hashRate: this.rate(now),
        elapsedMs: now - this.startedAt,
        lanes: backend.lanes,
        best,
        current: progress.current,
      };
      this.dirty = true;
    });

    // `backend.start` is itself awaited, so a stop during it lands here too.
    if (run !== this.generation) {
      backend.stop();
      return;
    }

    // Repaint on frames rather than on reports: the CPU backend reports ~11
    // times a second per lane and the GPU ~22, and neither cadence is the
    // display's. Coalescing here keeps React re-renders at one per frame.
    const tick = (): void => {
      if (run !== this.generation || !this.backend) return;
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

  /** End the current run. Safe to call at any point, including mid-start. */
  stop(): void {
    // Bumping first is what makes a start still in flight discard itself.
    this.generation++;
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
    if (choice === "cpu") return this.ports.cpu();
    try {
      return await this.ports.gpu();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (choice === "gpu") this.callbacks.onFallback?.(reason);
      else this.callbacks.onFallback?.(`${reason} — using worker threads`);
      return this.ports.cpu();
    }
  }
}
