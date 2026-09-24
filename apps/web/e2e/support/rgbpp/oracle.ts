/* The standard and the cell encodings, restated as a test oracle.
 *
 * Deliberately not imported from `src/lib`: a client that built the wrong
 * transaction must fail here instead of passing because both sides share its
 * mistake. The Rust script is the authority; `contracts/tests` checks it, and
 * this mirrors it (PROTOCOL.md §4).
 */

import { ccc } from "@ckb-ccc/core";
import { Transaction } from "@scure/btc-signer";

import { reverse } from "../bytes";
import { CONFIG, PLACEHOLDER } from "./constants";

// The standard, restated (PROTOCOL.md §4).
const UNIT = 100_000_000n;
const HALVING = 1008;
const MIN_CLZ = 16;
// A ticket's split: re-arming an idle cell, or arming one the ticket created.
export const REUSE = { promoter: 13_335, platform: 1_648 };
export const NEW_CELL = { promoter: 7_105, platform: 878 };
export const PLATFORM_SCRIPT = "0014f5c1e4b7673e5dfaa348f7cfaa7d73ef0a97a3be";
export const GRACE = 144;
export const OWNER_BY_INPUT_TYPE = 0x8000_0000;

export function sealOf(lock: ccc.Script): { txid: string; vout: number } | null {
  if (lock.codeHash !== CONFIG.rgbppLock.codeHash || lock.hashType !== CONFIG.rgbppLock.hashType) return null;
  const bytes = ccc.bytesFrom(lock.args);
  return { vout: Number(ccc.numLeFromBytes(bytes.slice(0, 4))), txid: reverse(ccc.hexFrom(bytes.slice(4)).slice(2)) };
}

export function withSeal(lock: ccc.Script, txid: string): ccc.Script {
  const seal = sealOf(lock);
  if (!seal || seal.txid !== PLACEHOLDER) return lock;
  return ccc.Script.from({
    ...CONFIG.rgbppLock,
    args: ccc.bytesConcat(ccc.numLeToBytes(seal.vout, 4), ccc.bytesFrom(reverse(txid), "hex")),
  });
}

export function clzOf(digest: Uint8Array): number {
  let n = 0;
  for (const byte of digest) {
    if (byte === 0) n += 8;
    else return n + Math.clz32(byte) - 24;
  }
  return n;
}

export function standardReward(clz: number, h0: number, anchor: number): bigint | null {
  if (clz < MIN_CLZ || anchor < h0) return null;
  return (UNIT * BigInt(clz * clz)) >> BigInt(Math.floor((anchor - h0) / HALVING));
}

type MinerState = "idle" | "armed" | "paid";

/** `ticket`: the txid (displayed order) an armed-from-paid cell names as its challenge. */
export function minerData(data: ccc.Hex): { state: MinerState; nonce: bigint; anchor: number; ticket: string | null } | null {
  const b = ccc.bytesFrom(data);
  if ((b.length !== 13 && b.length !== 45) || b[0] > 2) return null;
  const state = (["idle", "armed", "paid"] as const)[b[0]];
  if (b.length === 45 && state !== "armed") return null;
  const ticket = b.length === 45 ? reverse(ccc.hexFrom(b.slice(13)).slice(2)) : null;
  return { state, nonce: ccc.numLeFromBytes(b.slice(1, 9)), anchor: Number(ccc.numLeFromBytes(b.slice(9, 13))), ticket };
}

/** A transaction's outputs as the oracle reads payments: scriptPubKey hex and amount. */
export function outputsOf(raw: Uint8Array): Array<{ script: string; amount: number }> {
  const tx = Transaction.fromRaw(raw, { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true });
  return Array.from({ length: tx.outputsLength }, (_, i) => {
    const o = tx.getOutput(i);
    return { script: ccc.hexFrom(o.script!).slice(2), amount: Number(o.amount) };
  });
}

export const amountOf = (data: ccc.Hex) => ccc.numLeFromBytes(ccc.bytesFrom(data).slice(0, 16));
