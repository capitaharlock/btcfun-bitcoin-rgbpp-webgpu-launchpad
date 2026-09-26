import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";
import { OutScript, SigHash, Transaction } from "@scure/btc-signer";
import { hash160 } from "@scure/btc-signer/utils";
import { secp256k1 } from "@noble/curves/secp256k1";

import { deriveKey, TESTNET3, type Utxo } from "@/domain/bitcoin";
import { TESTNET } from "../config";
import { metadataHash, type LaunchTerms } from "../launch";
import { decodeAmount, type TokenCell } from "../cells/token";
import { tokenCellCapacity } from "../cells/capacity";
import { sealFromArgs } from "../seal";
import { signListing } from "./listing";
import { BUYER_SEAL_VOUT, completePurchase, planPurchase } from "./purchase";

const seller = deriveKey(new Uint8Array(32).fill(1), TESTNET3);
const buyer = deriveKey(new Uint8Array(32).fill(2), TESTNET3);
const terms: LaunchTerms = {
  h0: 100,
  metadataHash: metadataHash({ name: "Mesh", symbol: "MESH", description: "", imageHash: "" }),
  promoterScript: seller.script,
};
const cell: TokenCell = {
  outPoint: { txHash: "0x" + "ab".repeat(32), index: 0 },
  capacity: tokenCellCapacity(TESTNET, terms),
  seal: { txid: "cd".repeat(32), vout: 1 },
  amount: 250_000_000_000n,
};
const meta = { launchId: "mesh-0000000000000000", tokenId: "0x" + "ee".repeat(32) };
const coin = (value: number, txid = "ef", vout = 0): Utxo => ({ txid: txid.repeat(32), vout, value, confirmed: true });

describe("purchase", () => {
  it("keeps the seller's signature valid after the buyer adds inputs and outputs", () => {
    const listing = signListing(seller, meta, cell, 546, 30_000);
    const plan = planPurchase(TESTNET, terms, cell);
    const signed = completePurchase(buyer, listing, plan, [coin(100_000)], 2);
    const tx = Transaction.fromRaw(ccc.bytesFrom(signed.hex), { allowUnknownOutputs: true });

    // Price to the seller at 0, commitment at 1, the buyer's seal at 2.
    expect(ccc.hexFrom(tx.getOutput(0).script!)).toBe(ccc.hexFrom(seller.script));
    expect(tx.getOutput(0).amount).toBe(30_000n);
    expect(ccc.hexFrom(tx.getOutput(1).script!)).toBe("0x6a20" + plan.commitment.slice(2));
    expect(ccc.hexFrom(tx.getOutput(BUYER_SEAL_VOUT).script!)).toBe(ccc.hexFrom(buyer.script));

    // The seller's signature, checked against the final transaction.
    const [signature, pubkey] = tx.getInput(0).finalScriptWitness!;
    expect(ccc.hexFrom(pubkey)).toBe(ccc.hexFrom(seller.publicKey));
    const scriptCode = OutScript.encode({ type: "pkh", hash: hash160(seller.publicKey) });
    const digest = tx.preimageWitnessV0(0, scriptCode, SigHash.SINGLE_ANYONECANPAY, 546n);
    expect(secp256k1.verify(signature.slice(0, -1), digest, seller.publicKey, { format: "der" })).toBe(true);
  });

  it("reseals the whole cell to the buyer's output", () => {
    const plan = planPurchase(TESTNET, terms, cell);
    const out = ccc.CellOutput.from(plan.virtualTx.outputs[0]);
    expect(sealFromArgs(out.lock.args).vout).toBe(BUYER_SEAL_VOUT);
    expect(decodeAmount(plan.virtualTx.outputsData[0])).toBe(cell.amount);
    expect(plan.needPaymasterCell).toBe(false);
  });

  /* Captured before coin selection moved to `domain/bitcoin` `selectCoins`:
   * the seller's input counted for size and value, the buyer's coins after. */
  it("signs the same bytes it always did", () => {
    const listing = signListing(seller, meta, cell, 546, 30_000);
    const plan = planPurchase(TESTNET, terms, cell);
    expect(completePurchase(buyer, listing, plan, [coin(100_000)], 2).hex).toBe(
      "02000000000102cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd0100000000ffffffffefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef0000000000ffffffff0430750000000000001600141ce736ae31fb8e5e2ef4ad81be4bb74049f41db80000000000000000226a2094fc820815941166d9eaf068267c6505f40d320d12be5db09c80b9188b54989a220200000000000016001467237e479423a607f1068666435ddbc69afd5c183a0f01000000000016001467237e479423a607f1068666435ddbc69afd5c180247304402204e9f8bdfc3e6fbda52cd163a3d7813e61c6b28b51875bd9994d18bf60fd6b81f02200c3bcd5fde17bde68144f359d14262e009811647d0e0fd087672db94ce6fdf8c83210203e6d3f02aebc940c170613425af7316e401f858eb6ff5e80392deae87d83a9a02483045022100bda1c6ae1f0db50e0892013ab774b6a1b3c959d54e622b715a02ac5f50212c05022075928c8ad4c0ba0c7ce496676e9821d1a7d298de127ba837d88f5a374cb51344012103e5fc8be3b1947e87e3db876479d99334986622e547dcee80d4bd42b43a74650500000000",
    );
    expect(completePurchase(buyer, listing, plan, [coin(20_000), coin(15_000, "f0", 3)], 2).hex).toBe(
      "02000000000103cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd0100000000ffffffffefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef0000000000fffffffff0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f00300000000ffffffff0430750000000000001600141ce736ae31fb8e5e2ef4ad81be4bb74049f41db80000000000000000226a2094fc820815941166d9eaf068267c6505f40d320d12be5db09c80b9188b54989a220200000000000016001467237e479423a607f1068666435ddbc69afd5c18ca1000000000000016001467237e479423a607f1068666435ddbc69afd5c180247304402204e9f8bdfc3e6fbda52cd163a3d7813e61c6b28b51875bd9994d18bf60fd6b81f02200c3bcd5fde17bde68144f359d14262e009811647d0e0fd087672db94ce6fdf8c83210203e6d3f02aebc940c170613425af7316e401f858eb6ff5e80392deae87d83a9a02473044022010677da3211b22822248a7c3360e78e7be415a4c0f9022f9a933fee1972793b5022064f7a8c495f46490256a00385e9e0a8cddc4e902dd53b32cd980134399b508b9012103e5fc8be3b1947e87e3db876479d99334986622e547dcee80d4bd42b43a7465050247304402201a404d0724c636ccec10e32e5c25817f56a898169dcf82d4df62137f99cec51d0220200b728fcb70cd71bfbd2d47222e7d5146b53794bcc379bd7d6b01520037aaf8012103e5fc8be3b1947e87e3db876479d99334986622e547dcee80d4bd42b43a74650500000000",
    );
  });
});
