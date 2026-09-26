import { describe, expect, it } from "vitest";

import { MAX_MEMO_BYTES, P2WPKH_SCRIPT_BYTES, estimateVsize, opReturnScriptBytes } from "./size";

const P2WPKH = P2WPKH_SCRIPT_BYTES;

describe("estimateVsize", () => {
  it("matches the consensus size of a one-in two-out P2WPKH spend", () => {
    // base 113 B × 4 + witness 110 WU = 562 WU → 141 vB.
    expect(estimateVsize(1, [P2WPKH, P2WPKH])).toBe(141);
  });

  it("grows by an input and by an output", () => {
    expect(estimateVsize(2, [P2WPKH, P2WPKH]) - estimateVsize(1, [P2WPKH, P2WPKH])).toBe(68);
    expect(
      estimateVsize(1, [P2WPKH, P2WPKH, P2WPKH]) - estimateVsize(1, [P2WPKH, P2WPKH]),
    ).toBe(31);
  });

  it("charges an OP_RETURN for the bytes it occupies", () => {
    // An 80-byte memo is a 92 vB output, not a 31 vB one.
    const memo = opReturnScriptBytes(MAX_MEMO_BYTES);
    expect(memo).toBe(83);
    expect(estimateVsize(1, [P2WPKH, P2WPKH, memo])).toBe(233);
  });

  it("prices every push encoding an OP_RETURN can take", () => {
    expect(opReturnScriptBytes(0)).toBe(2);
    expect(opReturnScriptBytes(75)).toBe(77);
    expect(opReturnScriptBytes(76)).toBe(79); // PUSHDATA1 costs an extra byte
    expect(opReturnScriptBytes(80)).toBe(83);
  });

  it("has no witness at all without inputs", () => {
    expect(estimateVsize(0, [P2WPKH])).toBe(8 + 1 + 1 + 31);
  });
});
