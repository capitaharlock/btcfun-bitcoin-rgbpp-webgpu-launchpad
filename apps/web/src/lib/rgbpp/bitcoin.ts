/* The Bitcoin half of an RGB++ operation.
 *
 * Takes a plan (`operations.ts`) and produces the signed Bitcoin transaction
 * that commits to it: the commitment in an OP_RETURN at output 0, the plan's
 * seals and payments, then change. Its inputs are the sealed UTXOs the plan
 * consumes plus as many plain UTXOs as the outputs and the fee need.
 *
 * The plain UTXOs must not carry RGB++ cells of their own. Spending one would
 * leave its cells sealed to an output that no longer exists — unspendable for
 * good — so callers pass only UTXOs the RGB++ service reports as free
 * (`service.ts` `freeUtxos`), and this module never picks a coin by itself.
 */

import { Address, OutScript, Transaction } from "@scure/btc-signer";
import { ccc } from "@ckb-ccc/core";

import { DUST_SATS, ACTIVE, type NetworkConfig } from "../bitcoin/network";
import { estimateVsize, FeeTooLow, InsufficientFunds } from "../bitcoin/payment";
import type { WalletKey } from "../bitcoin/keys";
import type { Utxo } from "../bitcoin/provider";
import type { Plan, PlannedOutput } from "./operations";

export interface SignedOperation {
  hex: string;
  txid: string;
  vsize: number;
  fee: number;
  /** Plain UTXOs this transaction spends, so the caller can stop offering them. */
  funding: Utxo[];
}

function commitmentScript(commitment: ccc.Hex): Uint8Array {
  const data = ccc.bytesFrom(commitment);
  if (data.length !== 32) throw new RangeError("an RGB++ commitment is 32 bytes");
  return ccc.bytesConcat([0x6a, 0x20], data);
}

function scriptOf(output: PlannedOutput, key: WalletKey, network: NetworkConfig): Uint8Array {
  switch (output.kind) {
    case "seal":
      return key.script;
    case "ticket":
      return output.script;
    case "fee":
    case "paymaster":
    case "payment":
      return OutScript.encode(Address(network.params).decode(output.address));
  }
}

/**
 * Sign the Bitcoin transaction for `plan`.
 *
 * `sealed` are the UTXOs behind `plan.sealsSpent`, with their values; `free`
 * are plain UTXOs to fund outputs and fees, taken in the order given.
 */
export function signOperation(
  key: WalletKey,
  plan: Plan,
  sealed: readonly Utxo[],
  free: readonly Utxo[],
  feeRate: number,
  network: NetworkConfig = ACTIVE,
): SignedOperation {
  const wanted = new Set(plan.sealsSpent.map((s) => `${s.txid}:${s.vout}`));
  const mandatory = sealed.filter((u) => wanted.has(`${u.txid}:${u.vout}`));
  if (mandatory.length !== wanted.size) {
    throw new Error("a sealed UTXO the plan spends is missing from the wallet");
  }
  if (free.some((u) => wanted.has(`${u.txid}:${u.vout}`))) {
    throw new Error("a sealed UTXO was offered as plain funding");
  }

  const outputs = [
    { script: commitmentScript(plan.commitment), amount: 0n },
    ...plan.btcOutputs.map((o) => ({ script: scriptOf(o, key, network), amount: BigInt(o.value) })),
  ];
  for (const o of outputs.slice(1)) {
    if (o.amount < BigInt(DUST_SATS)) throw new RangeError("an RGB++ output is below the dust limit");
  }
  const scripts = outputs.map((o) => o.script.length);
  const spend = outputs.reduce((sum, o) => sum + Number(o.amount), 0);

  const inputs = [...mandatory];
  let gathered = inputs.reduce((sum, u) => sum + u.value, 0);
  let change = 0;
  let fee = 0;
  const pool = [...free];
  for (;;) {
    const withChange = Math.ceil(estimateVsize(inputs.length, [...scripts, key.script.length]) * feeRate);
    if (inputs.length > 0 && gathered >= spend + withChange) {
      const remainder = gathered - spend - withChange;
      if (remainder >= DUST_SATS) {
        change = remainder;
        fee = withChange;
      } else {
        change = 0;
        fee = gathered - spend;
      }
      break;
    }
    const next = pool.shift();
    if (!next) throw new InsufficientFunds(spend + withChange, gathered);
    inputs.push(next);
    gathered += next.value;
  }

  const tx = new Transaction({ allowUnknownOutputs: true });
  for (const utxo of inputs) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: key.script, amount: BigInt(utxo.value) },
    });
  }
  for (const o of outputs) tx.addOutput(o);
  if (change > 0) tx.addOutput({ script: key.script, amount: BigInt(change) });
  tx.sign(key.privateKey);
  tx.finalize();

  if (fee < tx.vsize * feeRate) throw new FeeTooLow(fee, tx.vsize, feeRate);
  return { hex: tx.hex, txid: tx.id, vsize: tx.vsize, fee, funding: inputs.slice(mandatory.length) };
}
