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
import { estimateVsize, FeeTooLow, InsufficientFunds, P2WPKH_SCRIPT_BYTES } from "../bitcoin/payment";
import type { WalletKey } from "../bitcoin/keys";
import type { Utxo } from "../bitcoin/provider";
import { SEAL_SATS, type Plan, type PlannedOutput } from "./operations";

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

/** The scriptPubKey a planned output pays; `own` is the wallet's, which every seal pays. */
function scriptOf(output: PlannedOutput, own: Uint8Array, network: NetworkConfig): Uint8Array {
  switch (output.kind) {
    case "seal":
      return own;
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
    ...plan.btcOutputs.map((o) => ({ script: scriptOf(o, key.script, network), amount: BigInt(o.value) })),
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

/**
 * The plain UTXOs an operation may be funded from: confirmed, not a seal, and
 * not an output of an operation still landing.
 *
 * The RGB++ service reports a UTXO as carrying cells only once its CKB
 * transaction has landed; until then the seal of an operation in flight looks
 * like a plain 546-sat output, and spending it would strand the cells it is
 * about to carry.
 */
export function plainFunding(utxos: readonly Utxo[], landing: ReadonlySet<string>): Utxo[] {
  return utxos.filter((u) => u.confirmed && u.value !== SEAL_SATS && !landing.has(u.txid));
}

/**
 * About how many plain sats signing `plan` will take: its outputs and the fee
 * for one funding input, less what its sealed inputs bring. The same shape
 * `signOperation` builds, so a wallet that has this much can pay; a second
 * funding input adds about 68 vB, which the caller's margin absorbs.
 */
export function fundingNeeded(plan: Plan, feeRate: number, network: NetworkConfig = ACTIVE): number {
  // Every wallet here is P2WPKH; only the length of its script matters to the size.
  const own = new Uint8Array(P2WPKH_SCRIPT_BYTES);
  const scripts = [
    commitmentScript(plan.commitment).length,
    ...plan.btcOutputs.map((o) => scriptOf(o, own, network).length),
    P2WPKH_SCRIPT_BYTES,
  ];
  const spend = plan.btcOutputs.reduce((sum, o) => sum + o.value, 0);
  const fee = Math.ceil(estimateVsize(plan.sealsSpent.length + 1, scripts) * Math.max(1, feeRate));
  return Math.max(0, spend + fee - plan.sealsSpent.length * SEAL_SATS);
}
