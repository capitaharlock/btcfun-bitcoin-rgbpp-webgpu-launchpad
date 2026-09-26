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

import { DUST_SATS, ACTIVE, type NetworkConfig } from "@/domain/bitcoin";
import { estimateVsize, FeeTooLow, InsufficientFunds, P2WPKH_SCRIPT_BYTES } from "@/domain/bitcoin";
import type { WalletKey } from "@/domain/bitcoin";
import type { Utxo } from "@/domain/bitcoin";
import { SEAL_SATS, type Plan, type PlannedOutput } from "./plans/plan";

export interface SignedOperation {
  hex: string;
  txid: string;
  vsize: number;
  fee: number;
  /** Plain UTXOs this transaction spends, so the caller can stop offering them. */
  funding: Utxo[];
}

/** Exact OP_RETURN script committed by the RGB++ Bitcoin transaction. */
export function commitmentScript(commitment: ccc.Hex): Uint8Array {
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

/** What sizes a Bitcoin transaction for fees: the sealed UTXOs it spends and the outputs it pays. */
export type Shape = Pick<Plan, "btcOutputs"> & { seals: number; commitment?: true };

/** The shape of `plan`'s Bitcoin transaction. */
export function shapeOf(plan: Plan): Shape {
  return { seals: plan.sealsSpent.length, btcOutputs: plan.btcOutputs, commitment: true };
}

/** One seal in, one seal out: an arming transaction, which pays nothing but the network. */
export const ARM_SHAPE: Shape = { seals: 1, btcOutputs: [{ kind: "seal", value: SEAL_SATS }], commitment: true };

/** A mint's shape: a first mint dissolves the miner cell into one seal; a later one keeps two. */
export function mintShape(holdsTokens: boolean): Shape {
  const seal = { kind: "seal", value: SEAL_SATS } as const;
  return { seals: holdsTokens ? 2 : 1, btcOutputs: holdsTokens ? [seal, seal] : [seal], commitment: true };
}

/**
 * About how many plain sats a transaction of `shape` takes: its outputs and
 * the fee for one funding input, less what its sealed inputs bring back. It
 * sizes the transaction with `estimateVsize`, the rule `signOperation` pays
 * by, so what is shown is what is signed; a second funding input adds about
 * 68 vB, which is why callers keep a margin.
 */
export function fundingNeeded(shape: Shape | Plan, feeRate: number, network: NetworkConfig = ACTIVE): number {
  const s = "virtualTx" in shape ? shapeOf(shape) : shape;
  return networkFee(s, feeRate, network) + s.btcOutputs.reduce((sum, o) => sum + o.value, 0) - s.seals * SEAL_SATS;
}

/** The network fee alone for a transaction of `shape`, at `feeRate`. */
export function networkFee(shape: Shape, feeRate: number, network: NetworkConfig = ACTIVE): number {
  // Every wallet here is P2WPKH; only the length of its script matters to the size.
  const own = new Uint8Array(P2WPKH_SCRIPT_BYTES);
  const scripts = [
    ...(shape.commitment ? [COMMITMENT_SCRIPT_BYTES] : []),
    ...shape.btcOutputs.map((o) => scriptOf(o, own, network).length),
    P2WPKH_SCRIPT_BYTES,
  ];
  return Math.ceil(estimateVsize(shape.seals + 1, scripts) * Math.max(1, feeRate));
}

/** `OP_RETURN OP_PUSHBYTES_32 <commitment>`. */
const COMMITMENT_SCRIPT_BYTES = 34;

/**
 * A transaction's serialization without witness data — what Bitcoin hashes
 * into its txid, and what the mint script reads a creating ticket from.
 */
export function strippedTx(hex: string): Uint8Array {
  const tx = Transaction.fromRaw(ccc.bytesFrom(`0x${hex.replace(/^0x/, "")}`), {
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
    disableScriptCheck: true,
  });
  return tx.toBytes(true, false);
}
