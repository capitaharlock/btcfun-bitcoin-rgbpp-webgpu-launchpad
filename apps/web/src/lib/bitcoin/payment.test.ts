import { describe, expect, it } from "vitest";
import { Transaction } from "@scure/btc-signer";

import { InsufficientFunds, buildPayment, estimateVsize, selectCoins } from "./payment";
import { DUST_SATS } from "./network";
import { deriveKey } from "./keys";
import { hexToBytes } from "../bytes";
import type { Utxo } from "./provider";

/** A second testnet address, derived the same way, to pay into. */
const RECIPIENT = deriveKey(new Uint8Array(32).fill(4)).address;

function utxo(value: number, n = 0): Utxo {
  return { txid: String(n).padStart(64, "0"), vout: n, value, confirmed: true };
}

const FEE_RATE = 2;

describe("estimateVsize", () => {
  it("grows with inputs and outputs", () => {
    expect(estimateVsize(1, 2)).toBe(11 + 68 + 62);
    expect(estimateVsize(2, 2) - estimateVsize(1, 2)).toBe(68);
    expect(estimateVsize(1, 3) - estimateVsize(1, 2)).toBe(31);
  });
});

describe("selectCoins", () => {
  it("uses one input when one suffices", () => {
    const s = selectCoins([utxo(100_000)], 50_000, FEE_RATE);
    expect(s.inputs).toHaveLength(1);
    expect(s.amount).toBe(50_000);
    expect(s.change).toBeGreaterThan(0);
  });

  it("always conserves value: inputs = amount + change + fee", () => {
    const utxos = [utxo(90_000, 1), utxo(40_000, 2), utxo(7_000, 3)];
    for (const amount of [1_000, 50_000, 95_000, 120_000]) {
      const s = selectCoins(utxos, amount, FEE_RATE);
      const gathered = s.inputs.reduce((sum, u) => sum + u.value, 0);
      expect(s.amount + s.change + s.fee).toBe(gathered);
    }
  });

  it("pays at least the fee its own size demands", () => {
    const utxos = [utxo(90_000, 1), utxo(40_000, 2)];
    for (const amount of [1_000, 60_000, 100_000]) {
      const s = selectCoins(utxos, amount, FEE_RATE);
      expect(s.fee).toBeGreaterThanOrEqual(Math.ceil(s.vsize * FEE_RATE));
    }
  });

  it("adds inputs until the fee for those inputs is covered", () => {
    // 60_000 + fee needs more than a single 50_000 input can pay.
    const s = selectCoins([utxo(50_000, 1), utxo(50_000, 2)], 60_000, FEE_RATE);
    expect(s.inputs).toHaveLength(2);
  });

  it("drops a dust change output and gives the remainder to the miner", () => {
    // Choose an amount leaving less than dust after the two-output fee.
    const value = 100_000;
    const feeWithChange = Math.ceil(estimateVsize(1, 2) * FEE_RATE);
    const amount = value - feeWithChange - (DUST_SATS - 1);
    const s = selectCoins([utxo(value)], amount, FEE_RATE);
    expect(s.change).toBe(0);
    expect(s.fee).toBe(value - amount);
    expect(s.vsize).toBe(estimateVsize(1, 1));
  });

  it("spends the largest UTXOs first", () => {
    const s = selectCoins([utxo(90_000, 1), utxo(10_000, 2)], 5_000, FEE_RATE);
    expect(s.inputs[0].value).toBe(90_000);
    expect(s.inputs).toHaveLength(1);
  });

  it("reports what was missing when funds fall short", () => {
    try {
      selectCoins([utxo(10_000)], 50_000, FEE_RATE);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientFunds);
      expect((err as InsufficientFunds).available).toBe(10_000);
      expect((err as InsufficientFunds).required).toBeGreaterThan(50_000);
    }
  });

  it("refuses amounts below the dust limit", () => {
    expect(() => selectCoins([utxo(100_000)], DUST_SATS - 1, FEE_RATE)).toThrow(RangeError);
    expect(() => selectCoins([utxo(100_000)], 0, FEE_RATE)).toThrow(RangeError);
  });

  it("charges more at a higher fee rate", () => {
    const cheap = selectCoins([utxo(100_000)], 50_000, 1);
    const dear = selectCoins([utxo(100_000)], 50_000, 20);
    expect(dear.fee).toBeGreaterThan(cheap.fee);
    expect(dear.change).toBeLessThan(cheap.change);
  });
});

describe("buildPayment", () => {
  const key = deriveKey(new Uint8Array(32).fill(9));
  const funding: Utxo[] = [utxo(200_000, 1), utxo(50_000, 2)];

  it("produces a transaction that parses back to what was selected", () => {
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: 120_000,
      feeRate: 3,
      utxos: funding,
    });

    const tx = Transaction.fromRaw(hexToBytes(signed.hex));
    expect(tx.inputsLength).toBe(signed.selection.inputs.length);
    expect(tx.outputsLength).toBe(signed.selection.change > 0 ? 2 : 1);
    expect(tx.id).toBe(signed.txid);

    // Output 0 pays the recipient exactly the requested amount.
    const paid = tx.getOutput(0);
    expect(paid.amount).toBe(120_000n);
  });

  it("signs and finalises every input it spends", () => {
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: 220_000,
      feeRate: 2,
      utxos: funding,
    });
    const tx = Transaction.fromRaw(hexToBytes(signed.hex));
    expect(tx.inputsLength).toBe(2);
    for (let i = 0; i < tx.inputsLength; i++) {
      // A finalised P2WPKH input carries <signature> <pubkey> and an empty
      // scriptSig. Without both, a node rejects the transaction outright.
      const input = tx.getInput(i);
      expect(input.finalScriptWitness).toBeDefined();
      expect(input.finalScriptWitness).toHaveLength(2);
      expect(input.finalScriptWitness?.[1]).toEqual(key.publicKey);
    }
  });

  it("returns change to the sender's own address", () => {
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: 50_000,
      feeRate: 2,
      utxos: funding,
    });
    expect(signed.selection.change).toBeGreaterThan(0);
    const tx = Transaction.fromRaw(hexToBytes(signed.hex));
    expect(tx.getOutput(1).script).toEqual(key.script);
  });

  it("commits a memo in an OP_RETURN output", () => {
    const memo = new TextEncoder().encode("btcfun:t1:mesh:7:02ab");
    const signed = buildPayment(key, {
      to: RECIPIENT,
      amountSats: 50_000,
      feeRate: 2,
      utxos: funding,
      memo,
    });
    const tx = Transaction.fromRaw(hexToBytes(signed.hex), { allowUnknownOutputs: true });
    const opReturn = tx.getOutput(tx.outputsLength - 1);
    expect(opReturn.amount).toBe(0n);
    expect(opReturn.script?.[0]).toBe(0x6a);
    expect(opReturn.script?.slice(2)).toEqual(memo);
  });

  it("refuses a memo the network would not relay", () => {
    expect(() =>
      buildPayment(key, {
        to: RECIPIENT,
        amountSats: 50_000,
        feeRate: 2,
        utxos: funding,
        memo: new Uint8Array(81),
      }),
    ).toThrow(RangeError);
  });
});
