import { describe, expect, it } from "vitest";

import { MAINNET, TESTNET3 } from "../bitcoin/network";
import { evidenceFor } from "./evidence";

const txid = "ab".repeat(32);

describe("feed evidence", () => {
  it("links a mint to its Bitcoin transaction and to the Proof page", () => {
    const e = evidenceFor({ kind: "mint", txid }, TESTNET3);
    expect(e.tx).toEqual({ txid, short: "ababab…abab", href: `https://mempool.space/testnet/tx/${txid}` });
    expect(e.proof).toBe(`#/proof/${txid}`);
  });

  it("links a transfer or a buy to its transaction only: the Proof page checks mints", () => {
    for (const kind of ["transfer", "fill"] as const) {
      const e = evidenceFor({ kind, txid }, TESTNET3);
      expect(e.tx?.href).toBe(`https://mempool.space/testnet/tx/${txid}`);
      expect(e.proof).toBeNull();
    }
  });

  it("follows the network's explorer", () => {
    expect(evidenceFor({ kind: "mint", txid }, MAINNET).tx?.href).toBe(`https://mempool.space/tx/${txid}`);
  });

  it("offers nothing for an event that names no transaction", () => {
    expect(evidenceFor({ kind: "offer" })).toEqual({ tx: null, proof: null });
    expect(evidenceFor({ kind: "mint", txid: undefined })).toEqual({ tx: null, proof: null });
  });
});
