import { describe, expect, it } from "vitest";

import { atoms, count, parseAmount } from "./format";

describe("count", () => {
  it("is exact below a million", () => {
    expect(count(0n)).toBe("0");
    expect(count(999_999n)).toBe("999,999");
  });

  it("shortens larger counts without ever rounding up", () => {
    expect(count(13_148_160n)).toBe("13.14M");
    expect(count(1_999_999_999n)).toBe("1.99B");
    expect(count(4_200_000_000_000n)).toBe("4.20T");
    expect(count(18_446_744_073_709_551_616n)).toBe("18,446,744.07T");
  });
});

describe("atoms", () => {
  // The test runner's locale is en-US: "," groups, "." marks decimals.
  it("shows a whole amount without decimals and a fraction with at most two", () => {
    expect(atoms(1_024n * 10n ** 8n, 8)).toBe("1,024");
    expect(atoms(102_427_000_000n, 8)).toBe("1,024.27");
    expect(atoms(102_450_000_000n, 8)).toBe("1,024.5");
    expect(atoms(102_427_999_999n, 8)).toBe("1,024.27");
  });

  it("never shows a positive amount as zero", () => {
    expect(atoms(5_625n, 8)).toBe("0.00005625");
    expect(atoms(0n, 8)).toBe("0");
  });

  it("round-trips through parseAmount", () => {
    expect(parseAmount(atoms(102_427_000_000n, 8).replace(",", ""), 8)).toBe(102_427_000_000n);
  });
});
