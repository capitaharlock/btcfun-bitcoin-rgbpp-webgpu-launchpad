import { describe, expect, it } from "vitest";
import { Transaction } from "@scure/btc-signer";

import { fromBase64, toBase64 } from "@/domain/codec";
import { deriveKey, TESTNET3 } from "@/domain/bitcoin";
import { TESTNET } from "../config";
import { metadataHash, type LaunchTerms } from "../launch";
import type { TokenCell } from "../cells/token";
import { tokenCellCapacity } from "../cells/capacity";
import { checkListing, signListing } from "./listing";

const seller = deriveKey(new Uint8Array(32).fill(1), TESTNET3);
const buyer = deriveKey(new Uint8Array(32).fill(2), TESTNET3);
const terms: LaunchTerms = {
  h0: 100,
  metadataHash: metadataHash({ name: "Mesh", symbol: "MESH", description: "", imageHash: "" }),
  promoterScript: seller.script,
};
const cell: TokenCell = {
  outPoint: { txHash: "0x" + "ab".repeat(32), index: 0 },
  capacity: tokenCellCapacity(TESTNET, terms),
  seal: { txid: "cd".repeat(32), vout: 1 },
  amount: 250_000_000_000n,
};
const meta = { launchId: "mesh-0000000000000000", tokenId: "0x" + "ee".repeat(32) };

describe("listing", () => {
  it("signs one input and one output under SINGLE|ANYONECANPAY, and says so", () => {
    const listing = signListing(seller, meta, cell, 546, 30_000);
    expect(checkListing(listing, TESTNET3)).toBeNull();
    expect(listing.amount).toBe("250000000000");
  });

  it("is caught when it misstates the price, the seller or the cell", () => {
    const listing = signListing(seller, meta, cell, 546, 30_000);
    expect(checkListing({ ...listing, priceSats: 1_000 }, TESTNET3)).toMatch(/price/);
    expect(checkListing({ ...listing, seller: buyer.address }, TESTNET3)).toMatch(/someone other/);
    expect(checkListing({ ...listing, seal: { ...listing.seal, vout: 2 } }, TESTNET3)).toMatch(/different output/);
    expect(checkListing({ ...listing, psbt: "AAAA" }, TESTNET3)).toMatch(/parse/);
    expect(checkListing({ ...listing, priceSats: Number.NaN }, TESTNET3)).toMatch(/invalid amounts/);
    expect(checkListing({ ...listing, sealValue: 547 }, TESTNET3)).toMatch(/input does not match/);
  });

  it("rejects a PSBT whose seller signature has been changed", () => {
    const listing = signListing(seller, meta, cell, 546, 30_000);
    const tx = Transaction.fromPSBT(fromBase64(listing.psbt), { allowUnknownOutputs: true });
    const input = tx.getInput(0);
    const signature = input.partialSig![0][1];
    const changed = fromBase64(listing.psbt);
    let offset = -1;
    for (let i = 0; i <= changed.length - signature.length; i++) {
      if (signature.every((byte, j) => changed[i + j] === byte)) { offset = i; break; }
    }
    expect(offset).toBeGreaterThanOrEqual(0);
    changed[offset + 10] ^= 1;
    expect(checkListing({ ...listing, psbt: toBase64(changed) }, TESTNET3)).toMatch(/signature is invalid/);
  });

  it("carries the bid it answers without changing what the seller signs", () => {
    const bid = "b1".repeat(32);
    const tagged = signListing(seller, { ...meta, bid }, cell, 546, 30_000);
    expect(tagged.bid).toBe(bid);
    expect(checkListing(tagged, TESTNET3)).toBeNull();
    expect(tagged.psbt).toBe(signListing(seller, meta, cell, 546, 30_000).psbt);
    expect("bid" in JSON.parse(JSON.stringify(signListing(seller, meta, cell, 546, 30_000)))).toBe(false);
  });

  it("refuses a price below dust", () => {
    expect(() => signListing(seller, meta, cell, 546, 100)).toThrow();
  });
});
