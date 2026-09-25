import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import { terms } from "../../test/rgbpp";
import { TESTNET } from "./config";
import { decodeTerms, encodeTerms, mintScript, tokenId, tokenScript } from "./launch";

describe("launch identity", () => {
  it("encodes the terms exactly as the mint script parses them", () => {
    const bytes = encodeTerms(terms);
    expect(bytes[0]).toBe(1);
    expect(bytes.length).toBe(1 + 4 + 32 + 1 + 22);
    expect(decodeTerms(bytes)).toEqual(terms);
    expect(() => decodeTerms(ccc.bytesConcat(bytes, [0]))).toThrow();
  });

  it("derives the token from the mint script, owner by input type", () => {
    const mint = mintScript(TESTNET, terms);
    const token = tokenScript(TESTNET, mint);
    expect(token.args).toBe(mint.hash() + "00000080");
    expect(tokenId(TESTNET, terms)).toBe(token.hash());
    expect(tokenId(TESTNET, { ...terms, h0: terms.h0 + 1 })).not.toBe(token.hash());
  });
});
