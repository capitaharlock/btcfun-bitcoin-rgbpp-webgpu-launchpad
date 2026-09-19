import { describe, expect, it } from "vitest";

import { count } from "./format";

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
