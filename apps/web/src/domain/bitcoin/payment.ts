/* Building and signing a P2WPKH payment.
 *
 * Coin selection (`coins.ts`) and size estimation (`size.ts`) are pure
 * functions over plain data, so the part that decides how much money moves is
 * unit-testable without a key, a network or a browser. `buildPayment` is the
 * only function here that touches secret material, and it does so inside the
 * vault's `use()` callback.
 *
 * The outputs are measured before a coin is chosen. Doing it the other way
 * round is what once let the OP_RETURN escape the fee calculation, and the
 * estimate is then checked against the finalised transaction so an
 * underpayment becomes an exception here rather than a stuck payment on chain.
 */

import { Address, OutScript, Transaction } from "@scure/btc-signer";

import { ACTIVE, type NetworkConfig } from "./network";
import type { WalletKey } from "./keys";
import type { Utxo } from "./types";
import { assertFeeCovers, selectCoins, type Selection } from "./coins";
import { MAX_MEMO_BYTES } from "./size";

export interface PaymentRequest {
  to: string;
  amountSats: number;
  feeRate: number;
  utxos: readonly Utxo[];
  /** Arbitrary bytes to commit in an OP_RETURN, at most 80. */
  memo?: Uint8Array;
}

export interface SignedPayment {
  hex: string;
  txid: string;
  selection: Selection;
  /** Virtual size of the finalised transaction, as a node will measure it. */
  vsize: number;
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
  if (request.memo && request.memo.length > MAX_MEMO_BYTES) {
    throw new RangeError(`OP_RETURN memo exceeds ${MAX_MEMO_BYTES} bytes`);
  }

  const recipientScript = addressScript(request.to, network);
  const memoScript = request.memo ? opReturn(request.memo) : null;
  const outputScripts = [recipientScript.length, ...(memoScript ? [memoScript.length] : [])];

  const selection = selectCoins({
    utxos: request.utxos,
    amount: request.amountSats,
    feeRate: request.feeRate,
    outputScripts,
    changeScript: key.script.length,
  });

  const tx = new Transaction({ allowUnknownOutputs: !!memoScript });

  for (const utxo of selection.inputs) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: key.script, amount: BigInt(utxo.value) },
    });
  }

  tx.addOutput({ script: recipientScript, amount: BigInt(selection.amount) });
  if (selection.change > 0) {
    tx.addOutput({ script: key.script, amount: BigInt(selection.change) });
  }
  if (memoScript) tx.addOutput({ script: memoScript, amount: 0n });

  tx.sign(key.privateKey);
  tx.finalize();
  assertFeeCovers(selection.fee, tx.vsize, request.feeRate);

  return { hex: tx.hex, txid: tx.id, selection, vsize: tx.vsize };
}

/** The scriptPubKey an address pays to, on the given network. Throws on an address of another network. */
export function addressScript(address: string, network: NetworkConfig): Uint8Array {
  return OutScript.encode(Address(network.params).decode(address));
}

/** `OP_RETURN <push> <data>` for a payload of at most 80 bytes. */
function opReturn(data: Uint8Array): Uint8Array {
  const prefix =
    data.length < 76 ? Uint8Array.of(0x6a, data.length) : Uint8Array.of(0x6a, 0x4c, data.length);
  const script = new Uint8Array(prefix.length + data.length);
  script.set(prefix, 0);
  script.set(data, prefix.length);
  return script;
}
