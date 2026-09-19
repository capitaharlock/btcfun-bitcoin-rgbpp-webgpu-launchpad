/* WebGPU mining backend.
 *
 * Owns the device, the pipeline and the dispatch loop. Two decisions carry the
 * performance here and are worth stating:
 *
 *   Batch size is auto-tuned, not fixed. A dispatch that takes 8 ms wastes the
 *   device on round-trip latency; one that takes 400 ms makes the tab stutter
 *   and `stop()` feel broken. The loop measures each dispatch and steers toward
 *   TARGET_MS, so an integrated GPU and a discrete one both end up busy.
 *
 *   The hit threshold rises with the best candidate. Recording every digest
 *   would drown the readback in traffic; recording only what beats the current
 *   best keeps the buffer nearly empty without losing anything the protocol
 *   cares about, since §4.2 weights the single best candidate per ticket.
 */

import { nonceWords } from "./progress";
import {
  HIT_WORDS,
  buildKernel,
} from "./shader";
import type {
  BackendAvailability,
  BackendProgress,
  Candidate,
  MiningBackend,
} from "./types";

/** Wall-clock target per dispatch. Big enough to amortise submit+map latency,
 *  small enough that `stop()` lands within a frame or two. */
const TARGET_MS = 45;

/** Dispatch sizes stay inside these bounds however the tuner drifts. */
const MIN_BATCH = 1 << 16;
const FIRST_BATCH = 1 << 20;

/** Hits recorded per dispatch before the host must shrink the batch. */
const HIT_CAPACITY = 512;

/** Floor for the recording threshold: ~1 hit per 65 k attempts at startup. */
const MIN_CLZ_FLOOR = 16;

/** Params uniform: 2×vec4<u32> + 4×u32. */
const PARAMS_BYTES = 48;

export class GpuBackend implements MiningBackend {
  readonly kind = "gpu" as const;

  private running = false;
  private onProgress: ((p: BackendProgress) => void) | null = null;
  private best: Candidate | null = null;
  private batch = FIRST_BATCH;
  /** Resolves when the dispatch loop has exited and no readback is in flight. */
  private loopDone: Promise<void> | null = null;
  private released = false;

  private constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: GPUComputePipeline,
    private readonly bindGroup: GPUBindGroup,
    private readonly buffers: {
      params: GPUBuffer;
      hits: GPUBuffer;
      sample: GPUBuffer;
      hitsRead: GPUBuffer;
      sampleRead: GPUBuffer;
    },
    private readonly workgroupSize: number,
    private readonly maxBatch: number,
    private readonly adapterInfo: string,
  ) {}

  /** Detect support without creating a device, for an honest UI badge. */
  static async probe(): Promise<BackendAvailability> {
    if (!("gpu" in navigator)) {
      return { kind: "gpu", available: false, detail: "navigator.gpu unavailable in this browser" };
    }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return { kind: "gpu", available: false, detail: "no adapter returned" };
      return { kind: "gpu", available: true, detail: describeAdapter(adapter) };
    } catch (err) {
      return { kind: "gpu", available: false, detail: `adapter request failed: ${errorText(err)}` };
    }
  }

  /** Acquire a device and compile the kernel. Throws if WebGPU is unusable. */
  static async create(): Promise<GpuBackend> {
    if (!("gpu" in navigator)) throw new Error("WebGPU is not available in this browser");

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("WebGPU reported no adapter");
    const device = await adapter.requestDevice();

    // Uncaptured device errors are asynchronous; without this they vanish and
    // the miner simply produces nothing. Surfacing them is how a shader typo
    // becomes a visible failure rather than a mysterious zero hashrate.
    device.addEventListener("uncapturederror", (ev) => {
      console.error("[gpu] uncaptured device error:", (ev as GPUUncapturedErrorEvent).error.message);
    });

    const workgroupSize = Math.min(256, device.limits.maxComputeInvocationsPerWorkgroup);
    const maxBatch = workgroupSize * device.limits.maxComputeWorkgroupsPerDimension;

    const module = device.createShaderModule({
      code: buildKernel({ workgroupSize, hitCapacity: HIT_CAPACITY }),
      label: "sha256d-miner",
    });
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

    const hitBytes = 4 + HIT_CAPACITY * HIT_WORDS * 4;
    const buffers = {
      params: device.createBuffer({
        size: PARAMS_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "params",
      }),
      hits: device.createBuffer({
        size: hitBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        label: "hits",
      }),
      sample: device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        label: "sample",
      }),
      hitsRead: device.createBuffer({
        size: hitBytes,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: "hits-read",
      }),
      sampleRead: device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: "sample-read",
      }),
    };

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.params } },
        { binding: 1, resource: { buffer: buffers.hits } },
        { binding: 2, resource: { buffer: buffers.sample } },
      ],
    });

    return new GpuBackend(
      device, pipeline, bindGroup, buffers, workgroupSize, maxBatch, describeAdapter(adapter),
    );
  }

  get lanes(): number {
    return this.batch;
  }

  describe(): string {
    return `${this.adapterInfo} · ${this.workgroupSize}-wide workgroups`;
  }

  async start(challenge: Uint8Array, from: bigint, onProgress: (p: BackendProgress) => void): Promise<void> {
    if (challenge.length < 32) throw new RangeError("challenge must be 32 bytes");
    // Single-use: `stop()` releases the device, so restarting would dispatch
    // against a destroyed one. The session creates a fresh backend per run.
    if (this.released || this.loopDone) throw new Error("GpuBackend cannot be restarted");
    this.running = true;
    this.onProgress = onProgress;
    this.best = null;
    this.batch = FIRST_BATCH;
    this.loopDone = this.loop(challengeWords(challenge), from);
  }

  /**
   * Stop grinding and release the device.
   *
   * Teardown is deferred until the dispatch loop has exited, because a
   * `mapAsync` submitted for the current batch is still in flight: destroying
   * its buffer first rejects that promise with "buffer was destroyed before
   * mapping was resolved". The backend is single-use — the session creates a
   * fresh one per run rather than restarting this.
   */
  stop(): void {
    this.running = false;
    this.onProgress = null;
    if (this.loopDone) void this.loopDone.then(() => this.release());
    else this.release();
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    for (const buffer of Object.values(this.buffers)) buffer.destroy();
    this.device.destroy();
  }

  /** Dispatches are consecutive ranges, so the frontier is simply where the next one starts. */
  private async loop(challenge: Uint32Array, from: bigint): Promise<void> {
    let nonce = from;

    while (this.running) {
      const count = this.batch;
      const started = performance.now();

      this.writeParams(challenge, nonce, count);
      this.device.queue.writeBuffer(this.buffers.hits, 0, new Uint32Array([0]));

      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(Math.ceil(count / this.workgroupSize));
      pass.end();
      encoder.copyBufferToBuffer(this.buffers.hits, 0, this.buffers.hitsRead, 0, this.buffers.hits.size);
      encoder.copyBufferToBuffer(this.buffers.sample, 0, this.buffers.sampleRead, 0, 32);
      this.device.queue.submit([encoder.finish()]);

      let hitWords: Uint32Array;
      let sampleWords: Uint32Array;
      try {
        [hitWords, sampleWords] = await Promise.all([
          readWords(this.buffers.hitsRead),
          readWords(this.buffers.sampleRead),
        ]);
      } catch (err) {
        // A lost device cannot recover; stop rather than spin on failures.
        // A failure after `stop()` is teardown, not a fault, so stay quiet.
        if (this.running) console.error("[gpu] readback failed, stopping:", errorText(err));
        this.running = false;
        return;
      }

      if (!this.running) return;

      const reported = hitWords[0];
      const improvements = this.collect(hitWords, Math.min(reported, HIT_CAPACITY));

      nonce += BigInt(count);
      this.onProgress?.({
        hashes: count,
        improvements,
        current: wordsToHex(sampleWords),
        frontier: nonce,
      });

      this.retune(performance.now() - started, reported > HIT_CAPACITY);
    }
  }

  /** Decode the hit buffer and keep only candidates that beat the running best. */
  private collect(words: Uint32Array, hits: number): Candidate[] {
    const improvements: Candidate[] = [];
    for (let i = 0; i < hits; i++) {
      const base = 1 + i * HIT_WORDS;
      const clz = words[base + 2];
      if (clz <= (this.best?.clz ?? -1)) continue;
      const candidate: Candidate = {
        nonce: (BigInt(words[base + 1]) << 32n) | BigInt(words[base]),
        clz,
        hash: wordsToHex(words.subarray(base + 3, base + 11)),
      };
      this.best = candidate;
      improvements.push(candidate);
    }
    // The buffer is unordered, so improvements can arrive out of order within a
    // dispatch. Sorting makes the UI's improvement log monotone.
    improvements.sort((a, b) => a.clz - b.clz);
    return improvements;
  }

  /** Steer the batch size toward TARGET_MS, halving immediately on overflow. */
  private retune(elapsedMs: number, overflowed: boolean): void {
    if (overflowed) {
      this.batch = Math.max(MIN_BATCH, Math.floor(this.batch / 2));
      return;
    }
    if (elapsedMs <= 0) return;
    // Damped so a single slow frame (tab blur, compositor hitch) does not
    // collapse the batch size and strand the device idle afterwards.
    const ideal = (this.batch * TARGET_MS) / elapsedMs;
    const next = this.batch + (ideal - this.batch) * 0.35;
    this.batch = Math.min(this.maxBatch, Math.max(MIN_BATCH, Math.round(next)));
  }

  private writeParams(challenge: Uint32Array, nonce: bigint, count: number): void {
    const params = new Uint32Array(PARAMS_BYTES / 4);
    params.set(challenge, 0);
    const start = nonceWords(nonce);
    params[8] = start.lo;
    params[9] = start.hi;
    params[10] = count;
    params[11] = Math.max(MIN_CLZ_FLOOR, this.best?.clz ?? 0);
    this.device.queue.writeBuffer(this.buffers.params, 0, params);
  }
}

function describeAdapter(adapter: GPUAdapter): string {
  const info = adapter.info as GPUAdapterInfo | undefined;
  const parts = [info?.description, info?.device, info?.vendor, info?.architecture]
    .filter((p): p is string => !!p && p.length > 0);
  return parts.length > 0 ? parts[0] : "WebGPU adapter";
}

/** Big-endian challenge words, matching the kernel's `w1[0..7]`. */
function challengeWords(challenge: Uint8Array): Uint32Array {
  const words = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    words[i] =
      ((challenge[i * 4] << 24) |
        (challenge[i * 4 + 1] << 16) |
        (challenge[i * 4 + 2] << 8) |
        challenge[i * 4 + 3]) >>>
      0;
  }
  return words;
}

async function readWords(buffer: GPUBuffer): Promise<Uint32Array> {
  await buffer.mapAsync(GPUMapMode.READ);
  const copy = new Uint32Array(buffer.getMappedRange()).slice();
  buffer.unmap();
  return copy;
}

function wordsToHex(words: Uint32Array): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += words[i].toString(16).padStart(8, "0");
  return s;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
