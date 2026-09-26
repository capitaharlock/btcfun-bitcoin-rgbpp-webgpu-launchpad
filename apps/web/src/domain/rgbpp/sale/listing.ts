/* A listing: tokens for sale, signed once by a seller who then goes offline.
 *
 * `PROTOCOL.md` §5.1. The seller keeps the tokens for sale in a cell of their
 * own, sealed to one Bitcoin output, and signs exactly two things with
 * `SIGHASH_SINGLE | ANYONECANPAY`: that output as input 0, and the price paid
 * to themselves as output 0. The signature says nothing about any other input
 * or output, so a buyer can later add their own (`purchase.ts`) and broadcast
 * the whole transaction alone.
 *
 * What the buyer must check before paying — that the listed cell exists and
 * holds what the listing says — is `checkListing` plus a read of the cell,
 * because the listing itself is only a claim until the chain confirms it.
 */

import { OutScript, SigHash, Transaction } from "@scure/btc-signer";
import { hash160 } from "@scure/btc-signer/utils";
import { ccc } from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1";

import { fromBase64, toBase64 } from "@/domain/codec";
import { DUST_SATS, ACTIVE, addressScript, type NetworkConfig, type WalletKey } from "@/domain/bitcoin";
import type { TokenCell } from "../cells/token";
import type { Seal } from "../seal";

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
  /**
   * The bid this listing answers, by its activity id, when a holder signed it
   * to meet one (`domain/market/bid.ts`). A label for the bidder to find it by,
   * not a restriction: the PSBT does not know it, so anyone may still buy.
   */
  bid?: string;
}

/**
 * Sign a listing for `cell`, whose whole amount is for sale at `priceSats`.
 * The cell's seal must be one of `key`'s outputs, worth `sealValue` sats.
 */
export function signListing(
  key: WalletKey,
  meta: { launchId: string; tokenId: string; bid?: string },
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
  if (!Number.isSafeInteger(listing.priceSats) || listing.priceSats < DUST_SATS ||
      !Number.isSafeInteger(listing.sealValue) || listing.sealValue < DUST_SATS ||
      typeof listing.amount !== "string" || !/^[1-9][0-9]*$/.test(listing.amount) ||
      !listing.seal || !/^[0-9a-f]{64}$/.test(listing.seal.txid) ||
      !Number.isInteger(listing.seal.vout) || listing.seal.vout < 0) {
    return "The listing contains invalid amounts or a malformed seal.";
  }
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
  const [pubkey, signature] = input.partialSig[0];
  if (signature[signature.length - 1] !== SigHash.SINGLE_ANYONECANPAY) {
    return "The seller signed with a sighash that would not let a buyer complete the sale.";
  }
  const output = tx.getOutput(0);
  let sellerScript: Uint8Array;
  try {
    sellerScript = addressScript(listing.seller, network);
  } catch {
    return "The seller's address is not valid on this network.";
  }
  if (!output.script || ccc.hexFrom(output.script) !== ccc.hexFrom(sellerScript)) {
    return "The PSBT pays someone other than the seller.";
  }
  if (output.amount !== BigInt(listing.priceSats)) return "The PSBT's price differs from the listing's.";
  if (!input.witnessUtxo || input.witnessUtxo.amount !== BigInt(listing.sealValue) ||
      ccc.hexFrom(input.witnessUtxo.script) !== ccc.hexFrom(sellerScript)) {
    return "The PSBT's input does not match the seller's sealed output.";
  }
  // Not `verifySignature` from `domain/codec`: that checks the compact 64-byte
  // encoding the app's own records use, while a PSBT partial signature is DER
  // with the sighash byte appended, as Bitcoin Script requires.
  try {
    const scriptCode = OutScript.encode({ type: "pkh", hash: hash160(pubkey) });
    const digest = tx.preimageWitnessV0(0, scriptCode, SigHash.SINGLE_ANYONECANPAY, BigInt(listing.sealValue));
    if (!secp256k1.verify(signature.slice(0, -1), digest, pubkey, { format: "der" })) {
      return "The seller's PSBT signature is invalid.";
    }
  } catch {
    return "The seller's PSBT signature is invalid.";
  }
  return null;
}
