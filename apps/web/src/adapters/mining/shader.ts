/* WGSL compute kernel: sha256d over a fixed 40-byte preimage.
 *
 * The preimage is `challenge32 || nonce_le64` (PROTOCOL.md §4.2), so it is
 * always 40 bytes and always pads into exactly one 64-byte block. Both hashes
 * are therefore a single compression each — no message-length branching, no
 * inner loop over blocks, no decimal nonce encoding. That is the whole reason
 * this kernel is fast: the work per invocation is two fixed compressions.
 *
 * Collecting results is lock-free. A shared mutex over "best so far" serialises
 * exactly the invocations that matter and is easy to get subtly wrong, so
 * instead every invocation whose digest clears `minClz` appends its full result
 * to a hit buffer via one `atomicAdd`. The host picks the winner and raises the
 * threshold as the best improves, which keeps the hit rate near zero and the
 * buffer far from full. Overflow is detected, not silently dropped: the host
 * sees `hitCount > capacity` and lowers the batch size.
 */

export interface KernelLayout {
  /** Invocations per workgroup. */
  workgroupSize: number;
  /** Maximum hits one dispatch may record before the host must intervene. */
  hitCapacity: number;
}

/** u32 words per hit record: nonceLo, nonceHi, clz, 8 digest words, 1 pad. */
export const HIT_WORDS = 12;

export function buildKernel({ workgroupSize, hitCapacity }: KernelLayout): string {
  return /* wgsl */ `
struct Params {
  challenge0: vec4<u32>,   // challenge words 0..3 (big-endian)
  challenge1: vec4<u32>,   // challenge words 4..7
  startLo: u32,
  startHi: u32,
  count: u32,
  minClz: u32,
};

struct Hits {
  count: atomic<u32>,
  words: array<u32>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> hits: Hits;
/** One digest per dispatch, for the live readout. Written by invocation 0. */
@group(0) @binding(2) var<storage, read_write> sample: array<u32, 8>;

const HIT_WORDS: u32 = ${HIT_WORDS}u;
const HIT_CAPACITY: u32 = ${hitCapacity}u;

const K = array<u32, 64>(
  0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
  0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
  0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
  0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
  0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
  0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
  0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
  0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u,
);

const IV = array<u32, 8>(
  0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u,
);

fn rotr(x: u32, n: u32) -> u32 { return (x >> n) | (x << (32u - n)); }
fn bswap(x: u32) -> u32 {
  return ((x & 0x000000ffu) << 24u) | ((x & 0x0000ff00u) << 8u)
       | ((x & 0x00ff0000u) >> 8u)  | ((x & 0xff000000u) >> 24u);
}

/** One SHA-256 compression of the block in \`w\`, starting from the IV. */
fn compress(w_in: array<u32, 16>) -> array<u32, 8> {
  var w: array<u32, 64>;
  for (var i = 0u; i < 16u; i = i + 1u) { w[i] = w_in[i]; }
  for (var i = 16u; i < 64u; i = i + 1u) {
    let x = w[i - 15u];
    let y = w[i - 2u];
    let s0 = rotr(x, 7u) ^ rotr(x, 18u) ^ (x >> 3u);
    let s1 = rotr(y, 17u) ^ rotr(y, 19u) ^ (y >> 10u);
    w[i] = w[i - 16u] + s0 + w[i - 7u] + s1;
  }

  var a = IV[0]; var b = IV[1]; var c = IV[2]; var d = IV[3];
  var e = IV[4]; var f = IV[5]; var g = IV[6]; var h = IV[7];

  for (var i = 0u; i < 64u; i = i + 1u) {
    let S1 = rotr(e, 6u) ^ rotr(e, 11u) ^ rotr(e, 25u);
    let ch = (e & f) ^ (~e & g);
    let t1 = h + S1 + ch + K[i] + w[i];
    let S0 = rotr(a, 2u) ^ rotr(a, 13u) ^ rotr(a, 22u);
    let maj = (a & b) ^ (a & c) ^ (b & c);
    let t2 = S0 + maj;
    h = g; g = f; f = e; e = d + t1;
    d = c; c = b; b = a; a = t1 + t2;
  }

  return array<u32, 8>(
    IV[0] + a, IV[1] + b, IV[2] + c, IV[3] + d,
    IV[4] + e, IV[5] + f, IV[6] + g, IV[7] + h,
  );
}

fn leading_zeros(d: array<u32, 8>) -> u32 {
  var n = 0u;
  for (var i = 0u; i < 8u; i = i + 1u) {
    let c = countLeadingZeros(d[i]);
    n = n + c;
    if (c != 32u) { return n; }
  }
  return 256u;
}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.count) { return; }

  // 64-bit nonce = start + idx, carried by hand (WGSL has no u64).
  let lo = params.startLo + idx;
  let hi = params.startHi + select(0u, 1u, lo < params.startLo);

  // Block 1: 32 challenge bytes, 8 nonce bytes little-endian, 0x80 pad,
  // length 40*8 = 320 bits in the final word.
  var w1: array<u32, 16>;
  w1[0] = params.challenge0.x; w1[1] = params.challenge0.y;
  w1[2] = params.challenge0.z; w1[3] = params.challenge0.w;
  w1[4] = params.challenge1.x; w1[5] = params.challenge1.y;
  w1[6] = params.challenge1.z; w1[7] = params.challenge1.w;
  w1[8] = bswap(lo);
  w1[9] = bswap(hi);
  w1[10] = 0x80000000u;
  for (var i = 11u; i < 15u; i = i + 1u) { w1[i] = 0u; }
  w1[15] = 320u;

  let first = compress(w1);

  // Block 2: the 32-byte digest, 0x80 pad, length 256 bits.
  var w2: array<u32, 16>;
  for (var i = 0u; i < 8u; i = i + 1u) { w2[i] = first[i]; }
  w2[8] = 0x80000000u;
  for (var i = 9u; i < 15u; i = i + 1u) { w2[i] = 0u; }
  w2[15] = 256u;

  let digest = compress(w2);

  if (idx == 0u) {
    for (var i = 0u; i < 8u; i = i + 1u) { sample[i] = digest[i]; }
  }

  let clz = leading_zeros(digest);
  if (clz < params.minClz) { return; }

  // Reserve a slot. A slot past capacity is not written, but still counted, so
  // the host can see the overflow and shrink the batch instead of losing hits
  // without knowing.
  let slot = atomicAdd(&hits.count, 1u);
  if (slot >= HIT_CAPACITY) { return; }

  let base = slot * HIT_WORDS;
  hits.words[base] = lo;
  hits.words[base + 1u] = hi;
  hits.words[base + 2u] = clz;
  for (var i = 0u; i < 8u; i = i + 1u) { hits.words[base + 3u + i] = digest[i]; }
  hits.words[base + 11u] = 0u;
}
`;
}
