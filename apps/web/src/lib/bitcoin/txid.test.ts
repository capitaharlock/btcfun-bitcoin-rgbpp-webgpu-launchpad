import { describe, expect, it } from "vitest";

import { bytesToHex, hexToBytes } from "../bytes";
import { displayTxid, TXID_PATTERN, txidFromInternal, txidToInternal } from "./txid";

// The genesis coinbase of Bitcoin mainnet: a transaction everyone can check.
const GENESIS_COINBASE =
  "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000";
const GENESIS_TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";

describe("txids", () => {
  it("is the reversed double SHA-256 of the stripped transaction", () => {
    expect(displayTxid(hexToBytes(GENESIS_COINBASE))).toBe(GENESIS_TXID);
  });

  it("crosses between displayed and internal order both ways", () => {
    const internal = txidToInternal(GENESIS_TXID);
    expect(bytesToHex(internal)).toBe("3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a");
    expect(txidFromInternal(internal)).toBe(GENESIS_TXID);
    // The input is not reversed in place.
    expect(bytesToHex(internal)).toBe("3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a");
  });

  it("refuses anything that is not 64 lowercase hex characters or 32 bytes", () => {
    expect(TXID_PATTERN.test(GENESIS_TXID)).toBe(true);
    expect(() => txidToInternal(GENESIS_TXID.toUpperCase())).toThrow(RangeError);
    expect(() => txidToInternal(`0x${GENESIS_TXID.slice(2)}`)).toThrow(RangeError);
    expect(() => txidToInternal(GENESIS_TXID.slice(2))).toThrow(RangeError);
    expect(() => txidFromInternal(new Uint8Array(31))).toThrow(RangeError);
  });
});
