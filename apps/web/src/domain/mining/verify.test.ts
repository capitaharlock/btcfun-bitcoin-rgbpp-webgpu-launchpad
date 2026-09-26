import { describe, expect, it } from "vitest";
import { NONCE_LIMIT, preimage, recompute, verifyCandidate } from "./verify";
import { advantageRatio, expectedClz, weightOf } from "./weight";
import { PREIMAGE_BYTES } from "./types";
import { hexToBytes } from "@/domain/codec";

const CHALLENGE = hexToBytes("00".repeat(31) + "2a");

describe("preimage", () => {
  it("is challenge32 followed by the nonce little-endian", () => {
    const buf = preimage(CHALLENGE, 0x0102030405060708n);
    expect(buf.length).toBe(PREIMAGE_BYTES);
    expect([...buf.subarray(0, 32)]).toEqual([...CHALLENGE]);
    expect([...buf.subarray(32)]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("covers the full 64-bit nonce range", () => {
    const buf = preimage(CHALLENGE, 0xffffffffffffffffn);
    expect([...buf.subarray(32)]).toEqual(Array(8).fill(255));
  });

  it("rejects a challenge that is not exactly 32 bytes", () => {
    expect(() => preimage(new Uint8Array(31), 0n)).toThrow(RangeError);
    // A longer challenge used to be silently truncated, so two
    // different challenges proved the same work.
    expect(() => preimage(new Uint8Array(33), 0n)).toThrow(RangeError);
  });

  it("rejects nonces outside the 64-bit field", () => {
    // Nonces 0 and 2^64 wrapped to the same preimage.
    expect(() => preimage(CHALLENGE, NONCE_LIMIT)).toThrow(RangeError);
    expect(() => preimage(CHALLENGE, -1n)).toThrow(RangeError);
    expect(() => preimage(CHALLENGE, NONCE_LIMIT - 1n)).not.toThrow();
  });
});

describe("recompute", () => {
  it("is deterministic", () => {
    expect(recompute(CHALLENGE, 7n)).toEqual(recompute(CHALLENGE, 7n));
  });

  it("separates nonces that differ only in the high word", () => {
    const low = recompute(CHALLENGE, 1n);
    const high = recompute(CHALLENGE, 1n << 32n);
    expect(low.hash).not.toBe(high.hash);
  });

  it("reports leading zeros consistent with its own digest", () => {
    for (let n = 0n; n < 200n; n++) {
      const c = recompute(CHALLENGE, n);
      const zeros = c.hash.match(/^0*/)?.[0].length ?? 0;
      // Each hex zero is 4 bits; clz must be at least that and less than +4.
      expect(c.clz).toBeGreaterThanOrEqual(zeros * 4);
      expect(c.clz).toBeLessThan(zeros * 4 + 4);
    }
  });
});

describe("verifyCandidate", () => {
  it("accepts a candidate it produced", () => {
    expect(verifyCandidate(CHALLENGE, recompute(CHALLENGE, 99n))).toBe(true);
  });

  it("rejects a tampered digest", () => {
    const c = recompute(CHALLENGE, 99n);
    expect(verifyCandidate(CHALLENGE, { ...c, hash: "0".repeat(64) })).toBe(false);
  });

  it("rejects a candidate lifted onto a different challenge", () => {
    const other = hexToBytes("11".repeat(32));
    expect(verifyCandidate(other, recompute(CHALLENGE, 99n))).toBe(false);
  });

  it("rejects an out-of-range nonce instead of throwing at the boundary", () => {
    const wrapped = { ...recompute(CHALLENGE, 0n), nonce: NONCE_LIMIT };
    expect(verifyCandidate(CHALLENGE, wrapped)).toBe(false);
  });
});

describe("weight", () => {
  it("expects one more zero bit per doubling of attempts", () => {
    expect(expectedClz(1 << 20)).toBeCloseTo(20, 9);
    expect(expectedClz(1 << 21)).toBeCloseTo(21, 9);
    expect(expectedClz(0)).toBe(0);
  });

  it("weights by the square of the leading zeros", () => {
    expect(weightOf(24)).toBe(576);
    expect(weightOf(0)).toBe(0);
    expect(weightOf(-1)).toBe(0);
  });

  it("bounds hardware advantage logarithmically", () => {
    // A millionfold hashrate advantage buys single-digit weight, not 1e6x.
    expect(advantageRatio(1 << 20, 1_000_000)).toBeCloseTo(3.99, 1);
    expect(advantageRatio(1 << 10, 1_000_000)).toBeCloseTo(8.96, 1);
  });

  it("hurts the smallest participants most", () => {
    // Same advantage applied to a smaller baseline yields a larger multiple —
    // the reason PROTOCOL.md §2 withdrew the "farm immunity" reading of clz².
    const small = advantageRatio(1 << 10, 1000);
    const large = advantageRatio(1 << 30, 1000);
    expect(small).toBeGreaterThan(large);
  });

  it("is neutral where the ratio is undefined", () => {
    expect(advantageRatio(0, 1000)).toBe(1);
    expect(advantageRatio(1 << 20, 0)).toBe(1);
  });
});
