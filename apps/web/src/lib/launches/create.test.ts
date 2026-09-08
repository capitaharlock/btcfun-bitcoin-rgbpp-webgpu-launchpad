import { describe, expect, it } from "vitest";

import {
  LAUNCH_ID_PATTERN,
  commitmentFor,
  commitmentId,
  idMatches,
  launchId,
  slugFor,
  validate,
  type LaunchDraft,
} from "./create";
import { deriveKey, identityOf } from "../bitcoin";

const ALICE = identityOf(deriveKey(new Uint8Array(32).fill(17)));
const BOB = identityOf(deriveKey(new Uint8Array(32).fill(18)));

const DRAFT: LaunchDraft = {
  symbol: "AUDIT",
  name: "Audit example",
  blurb: "A deterministic example used by the test suite.",
  opensInBlocks: 1,
  epochBlocks: 6,
  halfLife: 1008,
  decimals: 8,
  ticketSats: 1_000,
  minClz: 8,
  accent: "var(--amber)",
};

describe("launch identity", () => {
  it("is the symbol plus the digest of the terms", () => {
    const c = commitmentFor(DRAFT, ALICE, 100_000);
    expect(c.id).toMatch(LAUNCH_ID_PATTERN);
    expect(c.id.startsWith(`${slugFor(DRAFT.symbol)}-`)).toBe(true);
    expect(idMatches(c)).toBe(true);
  });

  /* The id used to be the lowercase symbol, so two creators committing
   * to different terms landed on one namespace — and the second launch would
   * have inherited the first one's ledger, reserve and ticket memos. */
  it("separates two creators who choose the same symbol", () => {
    const a = commitmentFor(DRAFT, ALICE, 100_000);
    const b = commitmentFor({ ...DRAFT, halfLife: 36 }, BOB, 100_000);
    expect(a.symbol).toBe(b.symbol);
    expect(a.id).not.toBe(b.id);
    expect(commitmentId(a)).not.toBe(commitmentId(b));
  });

  it("changes when any committed term changes", () => {
    const base = commitmentFor(DRAFT, ALICE, 100_000);
    const variants: Array<Partial<typeof base>> = [
      { symbol: "OTHER" },
      { name: "Something else" },
      { blurb: "A different sentence entirely." },
      { h0: base.h0 + 1 },
      { epochBlocks: 7 },
      { halfLife: 2016 },
      { decimals: 6 },
      { ticketSats: 2000 },
      { minClz: 9 },
      { accent: "var(--cyan)" },
      { creator: BOB },
      { at: "2026-01-01T00:00:00.000Z" },
    ];
    for (const change of variants) {
      expect(launchId({ ...base, ...change })).not.toBe(base.id);
    }
  });

  it("refuses a commitment whose stated id its terms do not produce", () => {
    const c = commitmentFor(DRAFT, ALICE, 100_000);
    expect(idMatches({ ...c, id: "audit-0000000000000000" })).toBe(false);
    expect(idMatches({ ...c, ticketSats: c.ticketSats + 1 })).toBe(false);
    // A fixture-style plain slug is not an id this scheme can produce.
    expect(LAUNCH_ID_PATTERN.test("mesh")).toBe(false);
  });
});

describe("validate", () => {
  it("accepts the example draft", () => {
    expect(validate(DRAFT)).toEqual({});
  });

  it("keeps the seeded symbols for the seeded launches", () => {
    expect(validate({ ...DRAFT, symbol: "MESH" }).symbol).toMatch(/seeded launch/);
  });

  it("requires a future opening height", () => {
    // §5: a creator who can open in the past can mine before announcing.
    expect(validate({ ...DRAFT, opensInBlocks: 0 }).opensInBlocks).toBeDefined();
    expect(validate({ ...DRAFT, opensInBlocks: -1 }).opensInBlocks).toBeDefined();
  });

  it("bounds every numeric term", () => {
    expect(validate({ ...DRAFT, epochBlocks: 0 }).epochBlocks).toBeDefined();
    expect(validate({ ...DRAFT, epochBlocks: 145 }).epochBlocks).toBeDefined();
    expect(validate({ ...DRAFT, halfLife: 35 }).halfLife).toBeDefined();
    expect(validate({ ...DRAFT, decimals: 13 }).decimals).toBeDefined();
    expect(validate({ ...DRAFT, ticketSats: 545 }).ticketSats).toBeDefined();
    expect(validate({ ...DRAFT, minClz: 33 }).minClz).toBeDefined();
  });
});
