/* Building and signing a P2WPKH payment.
 *
 * Coin selection and size estimation are pure functions over plain data, so the
 * part that decides how much money moves is unit-testable without a key, a
 * network or a browser. `buildPayment` is the only function that touches secret
 * material, and it does so inside the vault's `use()` callback.
 *
 * The fee is computed from the actual transaction shape rather than guessed,
 * and selection iterates: adding an input to cover a fee raises the fee, so a
 * single pass can produce a transaction that cannot pay for itself.
 */

import { Transaction } from "@scure/btc-signer";

import { DUST_SATS, ACTIVE, type NetworkConfig } from "./network";
import type { WalletKey } from "./keys";
import type { Utxo } from "./provider";

/** Virtual bytes: P2WPKH input ≈ 68 vB, output ≈ 31 vB, overhead ≈ 11 vB. */
const VB_INPUT = 68;
const VB_OUTPUT = 31;
const VB_OVERHEAD = 11;

export function estimateVsize(inputs: number, outputs: number): number {
  return VB_OVERHEAD + inputs * VB_INPUT + outputs * VB_OUTPUT;
}

export interface Selection {
  inputs: Utxo[];
  /** Satoshis paid to the recipient. */
  amount: number;
  /** Satoshis returned to the sender, 0 when the remainder is dust. */
  change: number;
  /** Satoshis left to the miner — remainder below dust is added here. */
  fee: number;
  vsize: number;
}

export class InsufficientFunds extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(
      `Not enough confirmed balance: need ${required} sats including fee, have ${available}.`,
    );
    this.name = "InsufficientFunds";
  }
}

/**
 * Pick inputs for a payment of `amount` at `feeRate` sat/vB.
 *
 * Largest-first: fewest inputs, so the smallest fee and the least UTXO
 * fragmentation. Not privacy-optimal — a launchpad demo on testnet has no
 * privacy model to protect — and that trade-off is deliberate rather than
 * accidental.
 */
export function selectCoins(utxos: Utxo[], amount: number, feeRate: number): Selection {
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError("amount must be positive sats");
  if (amount < DUST_SATS) throw new RangeError(`amount below the ${DUST_SATS} sat dust limit`);

  const available = utxos.reduce((sum, u) => sum + u.value, 0);
  const inputs: Utxo[] = [];
  let gathered = 0;

  for (const utxo of utxos) {
    inputs.push(utxo);
    gathered += utxo.value;

    // Assume change exists; if it turns out to be dust we drop it below, which
    // only ever makes the transaction smaller and the fee sufficient.
    const withChange = estimateVsize(inputs.length, 2);
    const fee = Math.ceil(withChange * feeRate);
    if (gathered < amount + fee) continue;

    const remainder = gathered - amount - fee;
    if (remainder >= DUST_SATS) {
      return { inputs, amount, change: remainder, fee, vsize: withChange };
    }

    // Remainder is unspendable as an output: drop the change output and let it
    // go to the miner. Recompute the size so the reported fee is the real one.
    const withoutChange = estimateVsize(inputs.length, 1);
    return {
      inputs,
      amount,
      change: 0,
      fee: gathered - amount,
      vsize: withoutChange,
    };
  }

  const shortfall = amount + Math.ceil(estimateVsize(Math.max(1, inputs.length), 2) * feeRate);
  throw new InsufficientFunds(shortfall, available);
}

export interface PaymentRequest {
  to: string;
  amountSats: number;
  feeRate: number;
  utxos: Utxo[];
  /** Arbitrary bytes to commit in an OP_RETURN, at most 80. */
  memo?: Uint8Array;
}

export interface SignedPayment {
  hex: string;
  txid: string;
  selection: Selection;
}

/**
 * Build, sign and finalise the payment. Returns broadcast-ready hex.
 *
 * Nothing is sent here: broadcasting is a separate, explicit step, so a caller
 * can show the visitor exactly what they are about to publish first.
 */
export function buildPayment(
  key: WalletKey,
  request: PaymentRequest,
  network: NetworkConfig = ACTIVE,
): SignedPayment {
  const selection = selectCoins(request.utxos, request.amountSats, request.feeRate);
  const tx = new Transaction({ allowUnknownOutputs: !!request.memo });

  for (const utxo of selection.inputs) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: key.script, amount: BigInt(utxo.value) },
    });
  }

  tx.addOutputAddress(request.to, BigInt(selection.amount), network.params);
  if (selection.change > 0) {
    tx.addOutputAddress(key.address, BigInt(selection.change), network.params);
  }
  if (request.memo) {
    if (request.memo.length > 80) throw new RangeError("OP_RETURN memo exceeds 80 bytes");
    tx.addOutput({ script: opReturn(request.memo), amount: 0n });
  }

  tx.sign(key.privateKey);
  tx.finalize();

  return { hex: tx.hex, txid: tx.id, selection };
}

/** `OP_RETURN <len> <data>` for a payload of at most 75 bytes plus PUSHDATA1. */
function opReturn(data: Uint8Array): Uint8Array {
  const prefix =
    data.length < 76 ? Uint8Array.of(0x6a, data.length) : Uint8Array.of(0x6a, 0x4c, data.length);
  const script = new Uint8Array(prefix.length + data.length);
  script.set(prefix, 0);
  script.set(data, prefix.length);
  return script;
}
