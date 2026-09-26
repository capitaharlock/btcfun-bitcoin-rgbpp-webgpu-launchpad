/* The token cell: an xUDT balance sealed to a Bitcoin output.
 *
 * Its data is the xUDT amount, 16 bytes little-endian, as every xUDT reader
 * expects; anything past those 16 bytes belongs to the standard's extensions
 * and is ignored here.
 */

import { ccc } from "@ckb-ccc/core";

import type { SealedCell } from "./sealed";

export interface TokenCell extends SealedCell {
  amount: bigint;
}

export function encodeAmount(atoms: bigint): ccc.Hex {
  return ccc.hexFrom(ccc.numLeToBytes(atoms, 16));
}

export function decodeAmount(data: ccc.HexLike): bigint {
  return ccc.numLeFromBytes(ccc.bytesFrom(data).slice(0, 16));
}
