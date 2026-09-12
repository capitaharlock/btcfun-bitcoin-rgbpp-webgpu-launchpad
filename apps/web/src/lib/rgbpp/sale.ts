/* Selling tokens without the seller online and without anyone holding them.
 *
 * `PROTOCOL.md` §5.1. The seller keeps the tokens for sale in a cell of their
 * own, sealed to one Bitcoin output, and signs exactly two things with
 * `SIGHASH_SINGLE | ANYONECANPAY`: that output as input 0, and the price paid
 * to themselves as output 0. The signature says nothing about any other input
 * or output, so a buyer can later add their own — the RGB++ commitment, the
 * output their tokens will be sealed to, their funding and change — and
 * broadcast the whole transaction alone.
 *
 * Payment and delivery are one Bitcoin transaction. The seller's signature is
 * valid only if output 0 pays them; the RGB++ lock releases the listed cell
 * only to the CKB transaction the same Bitcoin transaction commits to. Neither
 * leg can happen without the other, and no third party is involved.
 *
 * What the buyer must check before paying — that the listed cell exists and
 * holds what the listing says — is `checkListing` plus a read of the cell,
 * because the listing itself is only a claim until the chain confirms it.
 */

import { Address, OutScript, SigHash, Transaction } from "@scure/btc-signer";
import { ccc } from "@ckb-ccc/core";

import { fromBase64, toBase64 } from "../bytes";
import { DUST_SATS, ACTIVE, type NetworkConfig } from "../bitcoin/network";
import { estimateVsize, FeeTooLow, InsufficientFunds } from "../bitcoin/payment";
import type { WalletKey } from "../bitcoin/keys";
import type { Utxo } from "../bitcoin/provider";
import { commitment } from "./commitment";
import type { RgbppConfig } from "./config";
import { mintScript, tokenScript, type LaunchTerms } from "./launch";
import { CKB_FEE, encodeAmount, SEAL_SATS, type Plan, type TokenCell } from "./operations";
import { pendingLock, type Seal } from "./seal";

export interface Listing {
  v: "btcfun/listing/1";
  launchId: string;
  tokenId: string;
  /** The CKB cell for sale. */
  outPoint: { txHash: string; index: number };
  /** The Bitcoin output that cell is sealed to, and its value. */
  seal: Seal;
  sealValue: number;
  /** Atoms for sale: the whole cell. */
  amount: string;
  priceSats: number;
  /** Where the price is paid. */
  seller: string;
  /** Base64 PSBT: one input, one output, the input signed under SINGLE|ANYONECANPAY. */
  psbt: string;
}

/** Output index the buyer's tokens are sealed to: after the price and the commitment. */
export const BUYER_SEAL_VOUT = 2;

/**
 * Sign a listing for `cell`, whose whole amount is for sale at `priceSats`.
 * The cell's seal must be one of `key`'s outputs, worth `sealValue` sats.
 */
export function signListing(
  key: WalletKey,
  meta: { launchId: string; tokenId: string },
  cell: TokenCell,
  sealValue: number,
  priceSats: number,
): Listing {
  if (!Number.isInteger(priceSats) || priceSats < DUST_SATS) {
    throw new RangeError(`a price is at least ${DUST_SATS} sats, the dust limit`);
  }
  const tx = new Transaction({ allowUnknownOutputs: true });
  tx.addInput({
    txid: cell.seal.txid,
    index: cell.seal.vout,
    witnessUtxo: { script: key.script, amount: BigInt(sealValue) },
    sighashType: SigHash.SINGLE_ANYONECANPAY,
  });
  tx.addOutput({ script: key.script, amount: BigInt(priceSats) });
  // Signed, not finalised: a listing pays out more than its one input holds,
  // so it is not a valid transaction until a buyer adds theirs. The partial
  // signature is what travels, as in any PSBT marketplace.
  tx.signIdx(key.privateKey, 0, [SigHash.SINGLE_ANYONECANPAY]);
  const outPoint = ccc.OutPoint.from(cell.outPoint);
  return {
    v: "btcfun/listing/1",
    ...meta,
    outPoint: { txHash: outPoint.txHash, index: Number(outPoint.index) },
    seal: cell.seal,
    sealValue,
    amount: cell.amount.toString(),
    priceSats,
    seller: key.address,
    psbt: toBase64(tx.toPSBT()),
  };
}

/** Why a listing's PSBT does not say what the listing says, or null. */
export function checkListing(listing: Listing, network: NetworkConfig = ACTIVE): string | null {
  let tx: Transaction;
  try {
    tx = Transaction.fromPSBT(fromBase64(listing.psbt), { allowUnknownOutputs: true });
  } catch {
    return "The listing's PSBT does not parse.";
  }
  if (tx.inputsLength !== 1 || tx.outputsLength !== 1) return "A listing signs exactly one input and one output.";
  const input = tx.getInput(0);
  const txid = input.txid ? ccc.hexFrom(input.txid).slice(2) : "";
  if (txid !== listing.seal.txid || input.index !== listing.seal.vout) {
    return "The PSBT spends a different output from the one the tokens are sealed to.";
  }
  if (!input.partialSig || input.partialSig.length !== 1) return "The seller's input is not signed.";
  const [, signature] = input.partialSig[0];
  if (signature[signature.length - 1] !== SigHash.SINGLE_ANYONECANPAY) {
    return "The seller signed with a sighash that would not let a buyer complete the sale.";
  }
  const output = tx.getOutput(0);
  let sellerScript: Uint8Array;
  try {
    sellerScript = OutScript.encode(Address(network.params).decode(listing.seller));
  } catch {
    return "The seller's address is not valid on this network.";
  }
  if (!output.script || ccc.hexFrom(output.script) !== ccc.hexFrom(sellerScript)) {
    return "The PSBT pays someone other than the seller.";
  }
  if (output.amount !== BigInt(listing.priceSats)) return "The PSBT's price differs from the listing's.";
  return null;
}

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

  const commitmentScript = ccc.bytesConcat([0x6a, 0x20], ccc.bytesFrom(plan.commitment));
  const outputs = [
    { script: sellerOutput.script!, amount: sellerOutput.amount! },
    { script: commitmentScript, amount: 0n },
    { script: key.script, amount: BigInt(SEAL_SATS) },
  ];
  const spend = listing.priceSats + SEAL_SATS;
  const scripts = outputs.map((o) => o.script.length);

  // The seller's input brings its own value; the buyer covers the rest.
  let gathered = listing.sealValue;
  const inputs: Utxo[] = [];
  let change = 0;
  let fee = 0;
  const pool = [...free];
  for (;;) {
    const withChange = Math.ceil(estimateVsize(inputs.length + 1, [...scripts, key.script.length]) * feeRate);
    if (inputs.length > 0 && gathered >= spend + withChange) {
      const remainder = gathered - spend - withChange;
      if (remainder >= DUST_SATS) {
        change = remainder;
        fee = withChange;
      } else {
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
  if (fee < tx.vsize * feeRate) throw new FeeTooLow(fee, tx.vsize, feeRate);
  return { hex: tx.hex, txid: tx.id, fee, vsize: tx.vsize };
}
