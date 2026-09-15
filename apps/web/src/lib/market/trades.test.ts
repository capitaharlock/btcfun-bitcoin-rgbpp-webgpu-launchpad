import { describe, expect, it } from "vitest";

import { deriveKey } from "../bitcoin/keys";
import { TESTNET3 } from "../bitcoin/network";
import type { ChainTx } from "../bitcoin/provider";
import type { Listing } from "../rgbpp/sale";
import { composeBid } from "./bid";
import { bidStatus, saleFault, tradeOf } from "./trades";

const seller = deriveKey(new Uint8Array(32).fill(5), TESTNET3);
const bidder = deriveKey(new Uint8Array(32).fill(6), TESTNET3);
const stranger = deriveKey(new Uint8Array(32).fill(7), TESTNET3);

const BID_ID = "b1".repeat(32);
const bid = composeBid({ launchId: "mesh-0000000000000000", tokenId: "0x" + "ee".repeat(32), amount: 5_000n, priceSats: 20_000 }, bidder.address);

const listing: Listing = {
  v: "btcfun/listing/1",
  launchId: bid.launchId,
  tokenId: bid.tokenId,
  outPoint: { txHash: "0x" + "ab".repeat(32), index: 0 },
  seal: { txid: "cd".repeat(32), vout: 1 },
  sealValue: 546,
  amount: bid.amount,
  priceSats: bid.priceSats,
  seller: seller.address,
  psbt: "",
  bid: BID_ID,
};

function sale(buyer: string, overrides: Partial<ChainTx> = {}): ChainTx {
  return {
    txid: "ef".repeat(32),
    confirmed: true,
    inputs: [{ txid: listing.seal.txid, vout: listing.seal.vout }, { txid: "12".repeat(32), vout: 0 }],
    outputs: [
      { address: seller.address, script: "0014", value: 20_000 },
      { address: null, script: "6a20" + "00".repeat(32), value: 0 },
      { address: buyer, script: "0014", value: 546 },
    ],
    ...overrides,
  };
}

describe("trades", () => {
  it("recognises the sale of a listing from its transaction alone", () => {
    const trade = tradeOf(listing, sale(bidder.address));
    expect(trade).toMatchObject({ amount: 5_000n, priceSats: 20_000, buyer: bidder.address, bid: BID_ID, confirmed: true });
  });

  it("rejects a transaction that does not spend the listed output first", () => {
    const tx = sale(bidder.address);
    expect(saleFault(listing, { ...tx, inputs: [...tx.inputs].reverse() })).toMatch(/listed output/);
  });

  it("rejects one that underpays or pays someone else", () => {
    const tx = sale(bidder.address);
    expect(saleFault(listing, { ...tx, outputs: [{ ...tx.outputs[0], value: 19_999 }, ...tx.outputs.slice(1)] })).toMatch(/price/);
    expect(saleFault(listing, { ...tx, outputs: [{ ...tx.outputs[0], address: stranger.address }, ...tx.outputs.slice(1)] })).toMatch(/price/);
  });

  it("rejects one with no commitment, which delivers nothing", () => {
    const tx = sale(bidder.address);
    expect(saleFault(listing, { ...tx, outputs: [tx.outputs[0], tx.outputs[2]] })).toMatch(/commitment/);
  });
});

describe("bid status", () => {
  const open = { listing };

  it("is open with nothing around it", () => {
    expect(bidStatus(BID_ID, bid, { listings: [], trades: [], cancelled: false })).toEqual({ state: "open" });
  });

  it("is accepted by a listing signed for exactly its terms, and only that", () => {
    expect(bidStatus(BID_ID, bid, { listings: [open], trades: [], cancelled: false })).toEqual({ state: "accepted", listing: open });
    for (const off of [{ priceSats: 19_000 }, { amount: "4999" }, { bid: "00".repeat(32) }, { bid: undefined }]) {
      expect(bidStatus(BID_ID, bid, { listings: [{ listing: { ...listing, ...off } }], trades: [], cancelled: false }).state).toBe("open");
    }
  });

  it("is filled only when the bidder received the tokens", () => {
    const toBidder = tradeOf(listing, sale(bidder.address))!;
    const toStranger = tradeOf(listing, sale(stranger.address))!;
    expect(bidStatus(BID_ID, bid, { listings: [], trades: [toBidder], cancelled: false })).toEqual({ state: "filled", trade: toBidder });
    expect(bidStatus(BID_ID, bid, { listings: [], trades: [toStranger], cancelled: false })).toEqual({ state: "open" });
  });

  it("puts a fill before a withdrawal, and a withdrawal before an acceptance", () => {
    const toBidder = tradeOf(listing, sale(bidder.address))!;
    expect(bidStatus(BID_ID, bid, { listings: [open], trades: [toBidder], cancelled: true }).state).toBe("filled");
    expect(bidStatus(BID_ID, bid, { listings: [open], trades: [], cancelled: true }).state).toBe("cancelled");
  });
});
