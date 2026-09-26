/* Completing a listing: the buyer's half of the sale, signed and broadcast alone.
 *
 * The Bitcoin payment and the commitment to delivery share one transaction.
 * The seller's signature (`listing.ts`) is valid only if the corresponding
 * output pays them; the buyer adds the RGB++ commitment, the output their
 * tokens will be sealed to, their funding and change.
 *
 * Delivery still needs a later CKB transaction accepted through the RGB++
 * proof path; a Bitcoin payment can confirm before that happens or even if it
 * fails. Do not report the purchase as delivered until CKB confirms it.
 */

import { SigHash, Transaction } from "@scure/btc-signer";

import { fromBase64 } from "@/domain/codec";
import { assertFeeCovers, selectCoins, type Utxo, type WalletKey } from "@/domain/bitcoin";
import { commitmentScript } from "../transaction";
import { commitment } from "../commitment";
import type { RgbppConfig } from "../config";
import { mintScript, tokenScript, type LaunchTerms } from "../launch";
import { CKB_FEE } from "../cells/capacity";
import { encodeAmount, type TokenCell } from "../cells/token";
import { SEAL_SATS, type Plan } from "../plans/plan";
import { pendingLock } from "../seal";
import { checkListing, type Listing } from "./listing";

/** Output index the buyer's tokens are sealed to: after the price and the commitment. */
export const BUYER_SEAL_VOUT = 2;

/** The CKB side of a purchase: the listed cell, resealed to the buyer's output. */
export function planPurchase(config: RgbppConfig, terms: LaunchTerms, listed: TokenCell): Plan {
  const token = tokenScript(config, mintScript(config, terms));
  const virtualTx = {
    inputs: [listed.outPoint],
    outputs: [{ capacity: listed.capacity - CKB_FEE, lock: pendingLock(config, BUYER_SEAL_VOUT), type: token }],
    outputsData: [encodeAmount(listed.amount)],
  };
  return {
    virtualTx,
    cellDeps: [...config.rgbppLockDeps, config.xudtDep, config.mintDep],
    commitment: commitment(virtualTx),
    // Output 0 is the seller's price and output 1 the commitment, both placed
    // by `completePurchase`; the plan lists only what follows them.
    btcOutputs: [{ kind: "seal", value: SEAL_SATS }],
    sealsSpent: [listed.seal],
    needPaymasterCell: false,
    sumInputsCapacity: listed.capacity,
  };
}

export interface SignedPurchase {
  hex: string;
  txid: string;
  fee: number;
  vsize: number;
}

/**
 * The buyer's transaction: the seller's signed input and price at index 0,
 * the commitment at output 1, the buyer's seal at output 2, then the buyer's
 * funding and change. Only the buyer's inputs are signed here.
 */
export function completePurchase(
  key: WalletKey,
  listing: Listing,
  plan: Plan,
  free: readonly Utxo[],
  feeRate: number,
): SignedPurchase {
  const fault = checkListing(listing);
  if (fault) throw new Error(fault);
  const offer = Transaction.fromPSBT(fromBase64(listing.psbt), { allowUnknownOutputs: true });
  const sellerInput = offer.getInput(0);
  const sellerOutput = offer.getOutput(0);

  const outputs = [
    { script: sellerOutput.script!, amount: sellerOutput.amount! },
    { script: commitmentScript(plan.commitment), amount: 0n },
    { script: key.script, amount: BigInt(SEAL_SATS) },
  ];

  // The seller's input is already signed and brings its own value; the buyer covers the rest.
  const { inputs, change, fee } = selectCoins({
    utxos: free,
    amount: listing.priceSats + SEAL_SATS,
    feeRate,
    outputScripts: outputs.map((o) => o.script.length),
    changeScript: key.script.length,
    foreign: { count: 1, value: listing.sealValue },
  });

  const tx = new Transaction({ allowUnknownOutputs: true });
  tx.addInput({
    txid: sellerInput.txid!,
    index: sellerInput.index!,
    witnessUtxo: sellerInput.witnessUtxo!,
    sighashType: SigHash.SINGLE_ANYONECANPAY,
    partialSig: sellerInput.partialSig!,
  });
  for (const utxo of inputs) {
    tx.addInput({ txid: utxo.txid, index: utxo.vout, witnessUtxo: { script: key.script, amount: BigInt(utxo.value) } });
  }
  for (const output of outputs) tx.addOutput(output);
  if (change > 0) tx.addOutput({ script: key.script, amount: BigInt(change) });
  for (let i = 1; i < tx.inputsLength; i++) tx.signIdx(key.privateKey, i);
  tx.finalize();
  assertFeeCovers(fee, tx.vsize, feeRate);
  return { hex: tx.hex, txid: tx.id, fee, vsize: tx.vsize };
}
