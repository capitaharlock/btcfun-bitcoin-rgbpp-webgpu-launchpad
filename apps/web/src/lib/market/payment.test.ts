import { describe, expect, it } from "vitest";

import { FILL_MEMO_BYTES, fillFromTx, fillMemo, fillsIn, opReturnData, readFillMemo } from "./payment";
import { offerId, signOffer } from "./offers";
import { deriveKey, identityOf, type ChainTx, type Vault, type WalletKey } from "../bitcoin";
import { bytesToHex } from "../bytes";

function vault(seed: number): Vault {
  const key = deriveKey(new Uint8Array(32).fill(seed));
  return {
    kind: "local",
    address: key.address,
    identity: identityOf(key),
    label: "test",
    use: async <T,>(fn: (k: WalletKey) => T | Promise<T>) => fn(key),
  };
}

const maker = vault(21);
const taker = vault(22);

const offer = () =>
  signOffer(maker, { launch: "mesh", amount: 100n, priceSats: 5_000n, expiresAt: 200_000 });

/** An OP_RETURN script pushing `data`, as a node would report it. */
function opReturn(data: Uint8Array): string {
  const prefix = data.length < 76 ? [0x6a, data.length] : [0x6a, 0x4c, data.length];
  return bytesToHex(Uint8Array.from([...prefix, ...data]));
}

function payment(overrides: Partial<{ to: string; value: number; memo: Uint8Array | null; txid: string }> & { id: string }): ChainTx {
  const memo = overrides.memo === undefined ? fillMemo(overrides.id, taker.identity) : overrides.memo;
  return {
    txid: overrides.txid ?? "ab".repeat(32),
    confirmed: false,
    outputs: [
      { address: overrides.to ?? maker.address, script: "0014" + "00".repeat(20), value: overrides.value ?? 5_000 },
      ...(memo ? [{ address: null, script: opReturn(memo), value: 0 }] : []),
    ],
  };
}

describe("fill memo", () => {
  it("names the offer and the buyer, inside the relay limit", async () => {
    const id = offerId((await offer()).offer);
    const memo = fillMemo(id, taker.identity);
    expect(memo.length).toBe(FILL_MEMO_BYTES);
    expect(memo.length).toBeLessThanOrEqual(80);
    expect(readFillMemo(memo)).toEqual({ offerPrefix: id.slice(0, 32), taker: taker.identity });
  });

  it("is read back out of the script a node reports", async () => {
    const id = offerId((await offer()).offer);
    const memo = fillMemo(id, taker.identity);
    expect(opReturnData(opReturn(memo))).toEqual(memo);
    expect(opReturnData("0014" + "00".repeat(20))).toBeNull();
  });

  it("refuses to be written for a malformed offer or buyer", () => {
    expect(() => fillMemo("zz", taker.identity)).toThrow(RangeError);
    expect(() => fillMemo("a".repeat(64), "nope")).toThrow(RangeError);
  });

  it("does not mistake other data for a fill", () => {
    expect(readFillMemo(new TextEncoder().encode("btcfun:t1:mesh:7:02ab"))).toBeNull();
    expect(readFillMemo(new Uint8Array(FILL_MEMO_BYTES))).toBeNull();
  });
});

describe("a payment read from the chain", () => {
  it("is a fill for the buyer the memo names", async () => {
    const signed = await offer();
    const fill = fillFromTx(payment({ id: offerId(signed.offer) }), signed);
    expect(fill).toMatchObject({ taker: taker.identity, paidSats: 5_000, offerId: offerId(signed.offer) });
  });

  const REFUSED: Array<[string, (id: string) => ChainTx, RegExp]> = [
    ["with no memo", (id) => payment({ id, memo: null }), /no btc.fun payment memo/],
    ["to another address", (id) => payment({ id, to: taker.address }), /pays nothing to the offer/],
    ["for less than the price", (id) => payment({ id, value: 4_999 }), /against a price/],
    ["naming another offer", (id) => payment({ id, memo: fillMemo("cd".repeat(32), taker.identity) }), /different offer/],
    ["from the maker to themselves", (id) => payment({ id, memo: fillMemo(id, maker.identity) }), /own offer/],
  ];
  for (const [why, build, reason] of REFUSED) {
    it(`is refused ${why}`, async () => {
      const signed = await offer();
      const result = fillFromTx(build(offerId(signed.offer)), signed);
      expect(result).toHaveProperty("fault");
      expect((result as { fault: string }).fault).toMatch(reason);
    });
  }

  it("settles each offer with the first valid payment only", async () => {
    const a = await offer();
    const b = await offer();
    const idA = offerId(a.offer);
    // Newest first, as the provider returns them.
    const txs = [
      payment({ id: idA, txid: "03".repeat(32) }),
      payment({ id: idA, txid: "02".repeat(32), value: 1 }),
      payment({ id: idA, txid: "01".repeat(32) }),
    ];
    const fills = fillsIn(txs, [a, b]);
    expect(fills.size).toBe(1);
    expect(fills.get(idA)?.txid).toBe("01".repeat(32));
  });
});
