import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MiningSession } from "./session";
import type { BackendProgress, MiningBackend, MiningBackends } from "@/ports";

const CHALLENGE = new Uint8Array(32).fill(3);

/** A backend that never hashes, so lifecycle is the only thing under test. */
class FakeBackend implements MiningBackend {
  readonly kind = "gpu" as const;
  readonly lanes = 1;
  started = false;
  stopped = false;
  from: bigint | null = null;
  private report: ((progress: BackendProgress) => void) | null = null;

  async start(_challenge: Uint8Array, from: bigint, onProgress: (progress: BackendProgress) => void): Promise<void> {
    this.started = true;
    this.from = from;
    this.report = onProgress;
  }

  stop(): void {
    this.stopped = true;
  }

  describe(): string {
    return "fake backend";
  }

  /** Deliver a report the way a worker message or a GPU readback would. */
  emit(hashes: number, frontier = 0n): void {
    this.report?.({ hashes, improvements: [], current: "0".repeat(64), frontier });
  }
}

/** A `gpu()` port the test resolves by hand, to hold a start mid-flight. */
function deferredPorts(backend: FakeBackend) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ports: MiningBackends = {
    cpu: () => backend,
    gpu: async () => {
      await gate;
      return backend;
    },
    probe: async () => [],
  };
  return { ports, release };
}

describe("MiningSession lifecycle", () => {
  let frames: Array<() => void>;

  beforeEach(() => {
    // Node has no rAF. Collect callbacks instead of running them, so a frame
    // only happens when the test says so.
    frames = [];
    globalThis.requestAnimationFrame = ((fn: FrameRequestCallback) => {
      frames.push(() => fn(0));
      return frames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  });

  /* Stop() during the await in start() was ignored, so the backend
   * started anyway and the session reported itself as running. */
  it("does not start a backend that was cancelled while it was being built", async () => {
    const backend = new FakeBackend();
    const { ports, release } = deferredPorts(backend);
    const session = new MiningSession({ onSample: () => {} }, ports);

    const starting = session.start(CHALLENGE, "gpu");
    session.stop();
    release();
    await starting;

    expect(backend.started).toBe(false);
    expect(backend.stopped).toBe(true);
    expect(session.running).toBe(false);
  });

  it("ignores reports that arrive after the run ended", async () => {
    const backend = new FakeBackend();
    const samples: number[] = [];
    const session = new MiningSession(
      { onSample: (s) => samples.push(s.hashes) },
      { cpu: () => backend, gpu: async () => backend, probe: async () => [] },
    );

    await session.start(CHALLENGE, "gpu");
    backend.emit(100);
    frames.forEach((run) => run());
    expect(samples).toEqual([100]);

    session.stop();
    backend.emit(500); // a worker message already in flight
    frames.forEach((run) => run());
    expect(samples).toEqual([100]);
  });

  it("keeps only the latest run when started twice", async () => {
    const first = new FakeBackend();
    const second = new FakeBackend();
    let next = first;
    const session = new MiningSession(
      { onSample: () => {} },
      { cpu: () => next, gpu: async () => next, probe: async () => [] },
    );

    await session.start(CHALLENGE, "gpu");
    next = second;
    await session.start(CHALLENGE, "gpu");

    expect(first.stopped).toBe(true);
    expect(second.started).toBe(true);
    expect(session.running).toBe(true);
  });

  it("falls back to the CPU and says why when the GPU is unavailable", async () => {
    const cpu = new FakeBackend();
    const reasons: string[] = [];
    const session = new MiningSession(
      { onSample: () => {}, onFallback: (r) => reasons.push(r) },
      {
        cpu: () => cpu,
        gpu: async () => {
          throw new Error("no adapter");
        },
        probe: async () => [],
      },
    );

    await session.start(CHALLENGE, "auto");
    expect(cpu.started).toBe(true);
    expect(reasons).toEqual(["no adapter — using worker threads"]);
  });

  it("is not running before a start or after a stop", async () => {
    const backend = new FakeBackend();
    const session = new MiningSession(
      { onSample: () => {} },
      { cpu: () => backend, gpu: async () => backend, probe: async () => [] },
    );

    expect(session.running).toBe(false);
    await session.start(CHALLENGE, "cpu");
    expect(session.running).toBe(true);
    session.stop();
    expect(session.running).toBe(false);
    // Stopping twice is harmless.
    session.stop();
    expect(session.running).toBe(false);
  });

  it("resumes from the nonce it is given and reports how far the sweep has gone", async () => {
    const backend = new FakeBackend();
    const frontiers: bigint[] = [];
    const session = new MiningSession(
      { onSample: (s) => frontiers.push(s.frontier) },
      { cpu: () => backend, gpu: async () => backend, probe: async () => [] },
    );

    await session.start(CHALLENGE, "cpu", 5_000n);
    expect(backend.from).toBe(5_000n);
    backend.emit(100, 5_100n);
    frames.splice(0).forEach((run) => run());
    // A report that lags behind (a slow lane) never moves the frontier back.
    backend.emit(10, 5_050n);
    frames.splice(0).forEach((run) => run());
    expect(frontiers).toEqual([5_100n, 5_100n]);
  });
});
