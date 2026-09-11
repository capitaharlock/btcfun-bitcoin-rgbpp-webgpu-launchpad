import { describe, expect, it } from "vitest";
import vectors from "../../../../contracts/vectors/reward.json";
import { recompute } from "./mining/verify";
import {
  blocksToNextHalving,
  halvingsAt,
  HALVING_BLOCKS,
  MIN_CLZ,
  reward,
  terminalHalving,
  ticketChallenge,
  UNIT,
} from "./standard";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("standard reward", () => {
  it("reproduces every reference vector", () => {
    for (const v of vectors.reward) {
      expect(reward(v.clz, v.h0, v.height), `clz ${v.clz} at +${v.height - v.h0}`).toBe(
        BigInt(v.reward),
      );
    }
  });

  it("uses the constants the vectors were computed with", () => {
    expect(UNIT.toString()).toBe(vectors.constants.UNIT);
    expect(HALVING_BLOCKS).toBe(vectors.constants.HALVING_BLOCKS);
    expect(MIN_CLZ).toBe(vectors.constants.MIN_CLZ);
  });

  it("matches the worked values in PROTOCOL.md §4.1", () => {
    expect(reward(24, 0, 0)).toBe(576n * UNIT);
    expect(reward(24, 0, 3 * HALVING_BLOCKS)).toBe(72n * UNIT);
  });

  it("refuses a mint before the launch opens instead of pricing it at zero", () => {
    expect(halvingsAt(100, 99)).toBeNull();
    expect(reward(40, 100, 99)).toBe(0n);
  });

  it("never increases with height, and ends at the terminal halving", () => {
    for (const clz of [MIN_CLZ, 24, 40, 256]) {
      let previous = reward(clz, 0, 0);
      for (let k = 1; k <= 45; k++) {
        const now = reward(clz, 0, k * HALVING_BLOCKS);
        expect(now <= previous).toBe(true);
        previous = now;
      }
      const end = terminalHalving(clz);
      expect(reward(clz, 0, (end - 1) * HALVING_BLOCKS) > 0n).toBe(true);
      expect(reward(clz, 0, end * HALVING_BLOCKS)).toBe(0n);
    }
    expect(terminalHalving(256)).toBe(43);
    expect(terminalHalving(40)).toBe(38);
  });

  it("counts blocks to the next halving from the launch's opening", () => {
    expect(blocksToNextHalving(1000, 1000)).toBe(HALVING_BLOCKS);
    expect(blocksToNextHalving(1000, 1000 + HALVING_BLOCKS - 1)).toBe(1);
    expect(blocksToNextHalving(1000, 990)).toBe(10);
  });
});

describe("ticket challenge", () => {
  it("hashes the outpoint the way the reference does, and the miner agrees", () => {
    for (const t of vectors.challenge) {
      const challenge = ticketChallenge(t.txid, t.vout);
      expect(hex(challenge)).toBe(t.challenge);
      const found = recompute(challenge, BigInt(t.nonce));
      expect(found.hash).toBe(t.hash);
      expect(found.clz).toBe(t.clz);
    }
  });

  it("rejects malformed outpoints rather than hashing them", () => {
    expect(() => ticketChallenge("XYZ", 0)).toThrow(RangeError);
    expect(() => ticketChallenge("0".repeat(64), -1)).toThrow(RangeError);
  });
});
