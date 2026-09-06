import { describe, expect, it } from "vitest";

import { checkFill, faultIn, fillMemo, offerId, signOffer, unitPrice, viewOffer } from "./offers";
import { OFFER_VERSION, type Fill, type SignedOffer } from "./types";
import { deriveKey, identityOf, signDigest, type Vault, type WalletKey } from "../bitcoin";
import { offerDigest } from "./offers";
import { bytesToHex } from "../bytes";

const LAUNCH = "mesh";
const DECIMALS = 8;

function testVault(seed: number): Vault {
  const entropy = new Uint8Array(32).fill(seed);
  const key = deriveKey(entropy);
  return {
    kind: "local",
    address: key.address,
    identity: identityOf(key),
    label: "test",
    use: async <T,>(fn: (k: WalletKey) => T | Promise<T>) => fn(key),
  };
}

const maker = testVault(11);
const taker = testVault(12);

async function makeOffer(overrides: Partial<Parameters<typeof signOffer>[1]> = {}) {
  return signOffer(maker, {
    launch: LAUNCH,
    amount: 500_000_000n, // 5 whole tokens
    priceSats: 10_000n,
    expiresAt: 200_000,
    ...overrides,
  });
}

/** Re-sign a mutated offer so the signature itself stays internally valid. */
async function resign(signed: SignedOffer, patch: Partial<SignedOffer["offer"]>) {
  const offer = { ...signed.offer, ...patch };
  const signature = await maker.use((key) => bytesToHex(signDigest(key, offerDigest(offer))));
  return { offer, signature };
}

describe("signOffer", () => {
  it("directs payment to the maker's own address", async () => {
    const signed = await makeOffer();
    expect(signed.offer.payTo).toBe(maker.address);
    expect(signed.offer.maker).toBe(maker.identity);
    expect(signed.offer.version).toBe(OFFER_VERSION);
  });

  it("gives identical offers distinct ids", async () => {
    const a = await makeOffer();
    const b = await makeOffer();
    expect(offerId(a.offer)).not.toBe(offerId(b.offer));
  });

  it("refuses a zero amount or price", async () => {
    await expect(makeOffer({ amount: 0n })).rejects.toThrow(/above zero/);
    await expect(makeOffer({ priceSats: 0n })).rejects.toThrow(/above zero/);
  });
});

describe("faultIn", () => {
  it("accepts an offer it just signed", async () => {
    expect(faultIn(await makeOffer(), LAUNCH)).toBeNull();
  });

  it("rejects an offer for another launch", async () => {
    expect(faultIn(await makeOffer(), "obsv")).toMatch(/for launch/);
  });

  it("rejects a tampered price even with a valid signature elsewhere", async () => {
    const signed = await makeOffer();
    const tampered = { ...signed, offer: { ...signed.offer, priceSats: "1" } };
    expect(faultIn(tampered, LAUNCH)).toMatch(/Signature does not verify/);
  });

  it("rejects an offer signed by someone other than the stated maker", async () => {
    const signed = await makeOffer();
    const forged = {
      offer: signed.offer,
      signature: await taker.use((key) => bytesToHex(signDigest(key, offerDigest(signed.offer)))),
    };
    expect(faultIn(forged, LAUNCH)).toMatch(/Signature does not verify/);
  });

  it("rejects payment to an address on another network", async () => {
    const signed = await makeOffer();
    const rerouted = await resign(signed, { payTo: "bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqjy5k8u" });
    expect(faultIn(rerouted, LAUNCH)).toMatch(/different network/);
  });

  it("rejects an unknown version", async () => {
    const signed = await makeOffer();
    const old = await resign(signed, { version: "btcfun/offer/0" });
    expect(faultIn(old, LAUNCH)).toMatch(/Unknown offer version/);
  });
});

describe("unitPrice", () => {
  it("is satoshis per whole token", async () => {
    const signed = await makeOffer();
    expect(unitPrice(signed.offer, DECIMALS)).toBe(2000); // 10 000 sats / 5 tokens
  });
});

describe("viewOffer", () => {
  const ctx = (over: Partial<Parameters<typeof viewOffer>[1]> = {}) => ({
    launch: LAUNCH,
    decimals: DECIMALS,
    tipHeight: 100_000,
    fills: new Map<string, Fill>(),
    settled: new Set<string>(),
    ...over,
  });

  it("is open before expiry with no fill", async () => {
    expect(viewOffer(await makeOffer(), ctx()).status).toBe("open");
  });

  it("expires by block height", async () => {
    expect(viewOffer(await makeOffer(), ctx({ tipHeight: 200_001 })).status).toBe("expired");
  });

  it("is awaiting transfer once paid", async () => {
    const signed = await makeOffer();
    const id = offerId(signed.offer);
    const fill: Fill = { offerId: id, txid: "a".repeat(64), taker: taker.identity, paidSats: 10_000, at: "" };
    expect(viewOffer(signed, ctx({ fills: new Map([[id, fill]]) })).status).toBe("awaiting-transfer");
  });

  it("is settled once the transfer is on the ledger", async () => {
    const signed = await makeOffer();
    const id = offerId(signed.offer);
    expect(viewOffer(signed, ctx({ settled: new Set([id]) })).status).toBe("settled");
  });

  it("reports an invalid offer rather than hiding it", async () => {
    const signed = await makeOffer();
    const tampered = { ...signed, offer: { ...signed.offer, amount: "1" } };
    const view = viewOffer(tampered, ctx());
    expect(view.status).toBe("invalid");
    expect(view.fault).toBeTruthy();
  });
});

describe("fills", () => {
  it("binds a payment to one offer", async () => {
    const signed = await makeOffer();
    const memo = fillMemo(offerId(signed.offer));
    expect(memo.length).toBeLessThanOrEqual(80);
    expect(new TextDecoder().decode(memo.slice(0, 10))).toBe("btcfun:f1:");
    // A different offer produces a different commitment.
    const other = await makeOffer();
    expect(fillMemo(offerId(other.offer))).not.toEqual(memo);
  });

  it("accepts a payment that covers the price", async () => {
    const signed = await makeOffer();
    const fill: Fill = {
      offerId: offerId(signed.offer),
      txid: "b".repeat(64),
      taker: taker.identity,
      paidSats: 10_000,
      at: "",
    };
    expect(checkFill(fill, signed)).toBeNull();
  });

  it("rejects an underpayment", async () => {
    const signed = await makeOffer();
    const fill: Fill = {
      offerId: offerId(signed.offer),
      txid: "b".repeat(64),
      taker: taker.identity,
      paidSats: 9_999,
      at: "",
    };
    expect(checkFill(fill, signed)).toMatch(/against a price of/);
  });

  it("rejects a payment aimed at another offer", async () => {
    const signed = await makeOffer();
    const other = await makeOffer();
    const fill: Fill = {
      offerId: offerId(other.offer),
      txid: "b".repeat(64),
      taker: taker.identity,
      paidSats: 10_000,
      at: "",
    };
    expect(checkFill(fill, signed)).toMatch(/different offer/);
  });

  it("refuses a maker filling their own offer", async () => {
    const signed = await makeOffer();
    const fill: Fill = {
      offerId: offerId(signed.offer),
      txid: "b".repeat(64),
      taker: maker.identity,
      paidSats: 10_000,
      at: "",
    };
    expect(checkFill(fill, signed)).toMatch(/own offer/);
  });
});
