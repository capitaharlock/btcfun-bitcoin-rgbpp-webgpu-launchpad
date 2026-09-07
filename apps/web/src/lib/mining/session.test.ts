import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MiningSession, type BackendPorts } from "./session";
import type { BackendProgress, MiningBackend } from "./types";

const CHALLENGE = new Uint8Array(32).fill(3);

/** A backend that never hashes, so lifecycle is the only thing under test. */
class FakeBackend implements MiningBackend {
  readonly kind = "gpu" as const;
  readonly lanes = 1;
  started = false;
  stopped = false;
  private report: ((progress: BackendProgress) => void) | null = null;

  async start(_challenge: Uint8Array, onProgress: (progress: BackendProgress) => void): Promise<void> {
    this.started = true;
    this.report = onProgress;
  }

  stop(): void {
    this.stopped = true;
  }

  describe(): string {
    return "fake backend";
  }

  /** Deliver a report the way a worker message or a GPU readback would. */
  emit(hashes: number): void {
    this.report?.({ hashes, improvements: [], current: "0".repeat(64) });
  }
}

/** A `gpu()` port the test resolves by hand, to hold a start mid-flight. */
function deferredPorts(backend: FakeBackend) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ports: BackendPorts = {
    cpu: () => backend,
    gpu: async () => {
      await gate;
      return backend;
    },
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

  /* AUD-12: stop() during the await in start() was ignored, so the backend
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
      { cpu: () => backend, gpu: async () => backend },
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
      { cpu: () => next, gpu: async () => next },
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
      { cpu: () => backend, gpu: async () => backend },
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
});
