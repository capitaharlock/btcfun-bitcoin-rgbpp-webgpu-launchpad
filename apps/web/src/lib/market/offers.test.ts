import { describe, expect, it } from "vitest";

import { checkFill, faultIn, offerId, signOffer, unitPrice, viewOffer } from "./offers";
import {
  offerIdInMemo,
  settlementFault,
  settlementMemo,
  settlementsIn,
  type Settlement,
} from "./settle";
import { OFFER_VERSION, type Fill, type SignedOffer } from "./types";
import { deriveKey, identityOf, signDigest, type Vault, type WalletKey } from "../bitcoin";
import { offerDigest } from "./offers";
import { recordDigest } from "../ledger/codec";
import { GENESIS_PREV, type SignedRecord, type TransferRecord } from "../ledger/types";
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

/** A payment covering an offer, as the taker would record it. */
function fillFor(signed: SignedOffer, over: Partial<Fill> = {}): Fill {
  return {
    offerId: offerId(signed.offer),
    txid: "a".repeat(64),
    taker: taker.identity,
    paidSats: Number(signed.offer.priceSats),
    at: "2026-09-23T00:00:00.000Z",
    ...over,
  };
}

/** The maker's delivery record, signed by whoever `from` says. */
async function deliveryFor(
  signed: SignedOffer,
  over: Partial<TransferRecord> = {},
  from: Vault = maker,
): Promise<SignedRecord<TransferRecord>> {
  const body: TransferRecord = {
    kind: "transfer",
    seq: 0,
    prev: GENESIS_PREV,
    at: "2026-09-23T00:00:00.000Z",
    launch: signed.offer.launch,
    author: signed.offer.maker,
    to: taker.identity,
    amount: signed.offer.amount,
    memo: settlementMemo(offerId(signed.offer)),
    ...over,
  };
  const signature = await from.use((key) => bytesToHex(signDigest(key, recordDigest(body))));
  return { body, signature };
}

/** Both legs, correct, for tests that need a settled offer to exist. */
async function settleFully(signed: SignedOffer): Promise<Settlement> {
  return {
    offerId: offerId(signed.offer),
    fill: fillFor(signed),
    record: await deliveryFor(signed),
  };
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
    settled: new Map<string, Settlement>(),
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

  it("is settled once both legs are in evidence", async () => {
    const signed = await makeOffer();
    const id = offerId(signed.offer);
    const settlement = await settleFully(signed);
    const view = viewOffer(signed, ctx({ settled: new Map([[id, settlement]]) }));
    expect(view.status).toBe("settled");
    expect(view.settlement).toBe(settlement);
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

/* "settled" used to follow from a memo prefix on any transfer, so a
 * one-atom transfer closed a 5-token sale and no payment had to exist. */
describe("settlement", () => {
  it("names the whole offer id, not a prefix", async () => {
    const signed = await makeOffer();
    const id = offerId(signed.offer);
    const memo = settlementMemo(id);
    expect(memo).toBe(`offer:${id}`);
    expect(memo.length).toBeLessThanOrEqual(120);
    expect(offerIdInMemo(memo)).toBe(id);
    // A truncated id is not an id.
    expect(offerIdInMemo(`offer:${id.slice(0, 32)}`)).toBeNull();
    expect(offerIdInMemo(undefined)).toBeNull();
    expect(offerIdInMemo("hello")).toBeNull();
  });

  it("accepts a delivery that matches the offer and the payment", async () => {
    const signed = await makeOffer();
    const record = await deliveryFor(signed);
    expect(settlementFault(record, signed, fillFor(signed))).toBeNull();

    const settled = settlementsIn([record], [signed], new Map([[offerId(signed.offer), fillFor(signed)]]));
    expect(settled.get(offerId(signed.offer))?.record).toBe(record);
  });

  it("refuses a delivery smaller than the offer", async () => {
    const signed = await makeOffer();
    const short = await deliveryFor(signed, { amount: "1" });
    expect(settlementFault(short, signed, fillFor(signed))).toMatch(/1 atoms against 500000000/);

    const settled = settlementsIn([short], [signed], new Map([[offerId(signed.offer), fillFor(signed)]]));
    expect(settled.size).toBe(0);
  });

  it("refuses a delivery with no payment behind it", async () => {
    const signed = await makeOffer();
    const record = await deliveryFor(signed);
    expect(settlementFault(record, signed, undefined)).toMatch(/No payment/);
    expect(settlementsIn([record], [signed], new Map()).size).toBe(0);
  });

  it("refuses a delivery to someone other than the taker who paid", async () => {
    const signed = await makeOffer();
    const elsewhere = await deliveryFor(signed, { to: maker.identity });
    expect(settlementFault(elsewhere, signed, fillFor(signed))).toMatch(/taker who paid/);
  });

  it("refuses a delivery that is not from the maker", async () => {
    const signed = await makeOffer();
    const impostor = await deliveryFor(signed, { author: taker.identity }, taker);
    expect(settlementFault(impostor, signed, fillFor(signed))).toMatch(/not from the maker/);
  });

  it("refuses a delivery on another launch", async () => {
    const signed = await makeOffer();
    const elsewhere = await deliveryFor(signed, { launch: "other" });
    expect(settlementFault(elsewhere, signed, fillFor(signed))).toMatch(/different launch/);
  });

  it("refuses a delivery naming a different offer", async () => {
    const signed = await makeOffer();
    const other = await makeOffer();
    const wrong = await deliveryFor(signed, { memo: settlementMemo(offerId(other.offer)) });
    expect(settlementFault(wrong, signed, fillFor(signed))).toMatch(/does not name that offer/);
  });

  it("carries the payment's own faults through", async () => {
    const signed = await makeOffer();
    const record = await deliveryFor(signed);
    const underpaid = fillFor(signed, { paidSats: 1 });
    expect(settlementFault(record, signed, underpaid)).toMatch(/against a price of/);
  });

  it("ignores claims and unrelated transfers when scanning a chain", async () => {
    const signed = await makeOffer();
    const id = offerId(signed.offer);
    const unrelated = await deliveryFor(signed, { memo: "just a note" });
    const real = await deliveryFor(signed);
    const settled = settlementsIn([unrelated, real], [signed], new Map([[id, fillFor(signed)]]));
    expect(settled.size).toBe(1);
    expect(settled.get(id)?.record).toBe(real);
  });
});
