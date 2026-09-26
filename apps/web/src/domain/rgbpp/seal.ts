/* RGB++ seals: a CKB cell bound to a Bitcoin output.
 *
 * The RGB++ lock's args are the molecule struct `RGBPPLock { out_index: Uint32,
 * btc_txid: Byte32 }` — 36 bytes, the index little-endian and the txid in
 * Bitcoin's internal byte order, which is the reverse of how explorers print
 * it. A cell created by the transaction that is still being built carries an
 * all-zero txid, because the txid cannot exist before the transaction does;
 * the RGB++ commitment is computed over that placeholder, and whoever submits
 * the CKB side writes the real txid in.
 */

import { ccc } from "@ckb-ccc/core";
import { txidFromInternal, txidToInternal } from "@/domain/bitcoin";
import type { RgbppConfig } from "./config";

export interface Seal {
  /** Displayed (explorer) byte order, 64 lowercase hex characters. */
  txid: string;
  vout: number;
}

export const PLACEHOLDER_TXID = "0".repeat(64);

export function sealArgs(seal: Seal): ccc.Hex {
  if (!Number.isInteger(seal.vout) || seal.vout < 0 || seal.vout > 0xffff_ffff) {
    throw new RangeError(`output index out of range: ${seal.vout}`);
  }
  return ccc.hexFrom(ccc.bytesConcat(ccc.numLeToBytes(seal.vout, 4), txidToInternal(seal.txid)));
}

export function sealFromArgs(args: ccc.HexLike): Seal {
  const bytes = ccc.bytesFrom(args);
  if (bytes.length !== 36) throw new RangeError(`RGB++ lock args are 36 bytes, got ${bytes.length}`);
  return {
    vout: Number(ccc.numLeFromBytes(bytes.slice(0, 4))),
    txid: txidFromInternal(bytes.slice(4)),
  };
}

export function rgbppLock(config: RgbppConfig, seal: Seal): ccc.Script {
  return ccc.Script.from({ ...config.rgbppLock, args: sealArgs(seal) });
}

/** A lock sealing a cell to output `vout` of the transaction being built. */
export function pendingLock(config: RgbppConfig, vout: number): ccc.Script {
  return rgbppLock(config, { txid: PLACEHOLDER_TXID, vout });
}

export function isRgbppLock(config: RgbppConfig, lock: ccc.ScriptLike): boolean {
  const script = ccc.Script.from(lock);
  return script.codeHash === config.rgbppLock.codeHash && script.hashType === config.rgbppLock.hashType;
}
