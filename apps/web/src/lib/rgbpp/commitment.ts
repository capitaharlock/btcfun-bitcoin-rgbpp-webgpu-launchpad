/* The RGB++ commitment — what a Bitcoin transaction's OP_RETURN carries.
 *
 * double-SHA256 over: "RGB++", version u16 = 0, input and output counts, each
 * input's out point, and each output's serialized cell followed by its data
 * length (u32 LE) and data. Outputs sealed to the transaction being built carry
 * the placeholder txid (`seal.ts`), so the commitment can be computed before
 * that transaction exists. This mirrors `check_btc_tx_commitment` in the RGB++
 * lock and `calculateCommitment` in the RGB++ SDK; the test pins it to both.
 *
 * Every input and output of the virtual transaction is committed. The RGB++
 * queue service computes the commitment the same way, and appends its own
 * inputs (the paymaster's) only after checking it.
 */

import { ccc } from "@ckb-ccc/core";
import { sha256 } from "@noble/hashes/sha2";

export interface VirtualTx {
  inputs: ccc.OutPointLike[];
  outputs: ccc.CellOutputLike[];
  outputsData: ccc.HexLike[];
}

export function commitment(tx: VirtualTx): ccc.Hex {
  if (tx.inputs.length > 255 || tx.outputs.length > 255) {
    throw new RangeError("an RGB++ transaction commits to at most 255 inputs and 255 outputs");
  }
  if (tx.outputs.length !== tx.outputsData.length) {
    throw new RangeError("every output needs its data");
  }
  const parts: Uint8Array[] = [
    new TextEncoder().encode("RGB++"),
    new Uint8Array([0, 0]),
    new Uint8Array([tx.inputs.length, tx.outputs.length]),
  ];
  for (const input of tx.inputs) parts.push(ccc.OutPoint.from(input).toBytes());
  tx.outputs.forEach((output, i) => {
    const data = ccc.bytesFrom(tx.outputsData[i]);
    parts.push(ccc.CellOutput.from(output).toBytes(), ccc.numLeToBytes(data.length, 4), data);
  });
  return ccc.hexFrom(sha256(sha256(ccc.bytesConcat(...parts))));
}
