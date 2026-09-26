import { describe, expect, it } from "vitest";

import { absorb, laneFrontier, NO_PROGRESS, nonceWords, readProgress, stronger, ticketKey, writeProgress, type TicketProgress } from "./progress";
import { NONCE_LIMIT, recompute } from "./verify";
import type { Candidate } from "./types";

const CHALLENGE = new Uint8Array(32).fill(7);
const OTHER = new Uint8Array(32).fill(8);
const KEY = ticketKey("ab".repeat(32), 1);

/** The strongest of the first `n` nonces, found the slow way. */
function bestOf(n: number, challenge = CHALLENGE): Candidate {
  let best = recompute(challenge, 0n);
  for (let i = 1; i < n; i++) {
    const c = recompute(challenge, BigInt(i));
    if (c.clz > best.clz) best = c;
  }
  return best;
}

describe("ticket progress: fold", () => {
  it("only moves forward, in both the frontier and the best", () => {
    const strong = bestOf(64);
    const weak: Candidate = { ...recompute(CHALLENGE, 1n) };
    const after = absorb({ next: 500n, best: strong }, 100n, weak.clz < strong.clz ? weak : strong);
    expect(after.next).toBe(500n);
    expect(after.best).toBe(strong);
    expect(absorb(NO_PROGRESS, 900n, strong)).toEqual({ next: 900n, best: strong });
  });

  it("returns the same object when nothing changed, so a render can be skipped", () => {
    const known: TicketProgress = { next: 10n, best: null };
    expect(absorb(known, 5n, null)).toBe(known);
  });

  it("keeps the earlier of two equally strong hashes", () => {
    const a = recompute(CHALLENGE, 3n);
    const b = { ...a, nonce: 99n };
    expect(stronger(a, b)).toBe(a);
    expect(stronger(null, b)).toBe(b);
  });

  it("never records a frontier past the end of the nonce space", () => {
    expect(absorb(NO_PROGRESS, NONCE_LIMIT + 5n, null).next).toBe(NONCE_LIMIT);
  });
});

describe("ticket progress: store", () => {
  it("round-trips the nonces tried and the best hash for a ticket", () => {
    const best = bestOf(256);
    const raw = writeProgress(null, KEY, { next: 123_456n, best }, CHALLENGE);
    expect(readProgress(raw, KEY, CHALLENGE)).toEqual({ next: 123_456n, best });
  });

  it("resumes an entry written before the frontier was kept: best restored, search from 0", () => {
    const best = bestOf(32);
    const legacy = JSON.stringify({ [KEY]: { nonce: best.nonce.toString() } });
    expect(readProgress(legacy, KEY, CHALLENGE)).toEqual({ next: 0n, best });
  });

  it("re-hashes a kept best against the challenge rather than trusting it", () => {
    const raw = writeProgress(null, KEY, { next: 10n, best: bestOf(256) }, CHALLENGE);
    const read = readProgress(raw, KEY, OTHER);
    expect(read.best).toEqual(recompute(OTHER, bestOf(256).nonce));
  });

  it("reads anything malformed as no progress, never as an error", () => {
    for (const raw of [null, "", "not json", "[]", "42", JSON.stringify({ [KEY]: { next: "-4", nonce: "x" } })]) {
      expect(readProgress(raw, KEY, CHALLENGE)).toEqual(NO_PROGRESS);
    }
    const huge = JSON.stringify({ [KEY]: { next: (NONCE_LIMIT + 1n).toString() } });
    expect(readProgress(huge, KEY, CHALLENGE).next).toBe(0n);
  });

  it("merges instead of overwriting, so a second tab cannot move the search back", () => {
    const best = bestOf(256);
    const ahead = writeProgress(null, KEY, { next: 9_000n, best }, CHALLENGE);
    const behind = writeProgress(ahead, KEY, { next: 50n, best: recompute(CHALLENGE, 0n) }, CHALLENGE);
    expect(readProgress(behind, KEY, CHALLENGE)).toEqual({ next: 9_000n, best });
  });

  it("keeps other tickets' entries untouched", () => {
    const other = ticketKey("cd".repeat(32), 1);
    const raw = writeProgress(writeProgress(null, other, { next: 7n, best: null }, OTHER), KEY, { next: 3n, best: null }, CHALLENGE);
    expect(readProgress(raw, other, OTHER).next).toBe(7n);
    expect(readProgress(raw, KEY, CHALLENGE).next).toBe(3n);
  });
});

describe("resuming a sweep", () => {
  it("counts the interleaved lanes' prefix up to the slowest lane", () => {
    expect(laneFrontier(0n, 4, [0, 0, 0, 0])).toBe(0n);
    expect(laneFrontier(1_000n, 4, [10, 12, 9, 11])).toBe(1_036n);
    expect(laneFrontier(5n, 1, [42])).toBe(47n);
    expect(laneFrontier(5n, 3, [])).toBe(5n);
  });

  it("covers every nonce below the frontier exactly once across lanes", () => {
    const from = 1_000n;
    const stride = 3;
    const counts = [5, 4, 6];
    const tried = new Set<bigint>();
    counts.forEach((n, lane) => {
      for (let k = 0; k < n; k++) tried.add(from + BigInt(lane) + BigInt(k * stride));
    });
    const frontier = laneFrontier(from, stride, counts);
    for (let n = from; n < frontier; n++) expect(tried.has(n)).toBe(true);
  });

  it("splits a nonce into the u32 words the worker and shader take, wrapping at 2^64", () => {
    expect(nonceWords(0n)).toEqual({ lo: 0, hi: 0 });
    expect(nonceWords((5n << 32n) | 0xfffffffen)).toEqual({ lo: 0xfffffffe, hi: 5 });
    expect(nonceWords(NONCE_LIMIT + 1n)).toEqual({ lo: 1, hi: 0 });
  });

  it("resumed from the frontier, a fold of two runs equals one run over the whole range", () => {
    // Run A tries [0, 40); run B, resumed from its frontier, tries [40, 256).
    const a = absorb(NO_PROGRESS, 40n, bestOf(40));
    let bestB: Candidate | null = null;
    for (let n = a.next; n < 256n; n++) bestB = stronger(bestB, recompute(CHALLENGE, n));
    const both = absorb(a, 256n, bestB);
    expect(both).toEqual({ next: 256n, best: bestOf(256) });
  });
});
