import { describe, expect, it } from "vitest";
import { clz256, sha256d, wordsToHex } from "./sha256";

describe("sha256d", () => {
  it("matches the known double-SHA-256 of the empty string", () => {
    const out = new Uint32Array(8);
    sha256d(new Uint8Array(0), out);
    expect(wordsToHex(out)).toBe(
      "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456",
    );
  });

  it("matches the known double-SHA-256 of 'abc'", () => {
    const out = new Uint32Array(8);
    sha256d(new TextEncoder().encode("abc"), out);
    expect(wordsToHex(out)).toBe(
      "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358",
    );
  });

  it("counts leading zero bits", () => {
    const w = new Uint32Array(8);
    expect(clz256(w)).toBe(256);
    w[0] = 0x00000001;
    expect(clz256(w)).toBe(31);
    w[0] = 0x80000000;
    expect(clz256(w)).toBe(0);
  });
});
