/* Arming a paid miner cell: the second signature of a round that created its
 * cell, paying only the network. It carries the launch's admission, without
 * which the mint script lets no miner in.
 */

import { ccc } from "@ckb-ccc/core";

import { displayTxid } from "@/domain/bitcoin";
import { ANCHOR_GRACE_BLOCKS } from "@/domain/protocol";
import type { RgbppConfig } from "../config";
import { mintScript, type LaunchTerms } from "../launch";
import { pendingLock } from "../seal";
import { CKB_FEE } from "../cells/capacity";
import { encodeMinerCell, TICKET_VOUT, type MinerCell } from "../cells/miner";
import { finish, SEAL_SATS, type Plan } from "./plan";

/**
 * Arm a paid miner cell: it moves to output 1 armed, naming its ticket as the
 * challenge, and the transaction pays nothing but the network. The btc.fun
 * witness carries the launch's admission — its registration and btc.fun's
 * certificate (`domain/launches/certificate.ts`), without which the script lets
 * no miner in — then the ticket transaction that created the cell, stripped
 * of its witness data as Bitcoin hashes it, so the script can check what it
 * paid.
 *
 * The anchor is the ticket's, which the miner has been shown the reward at
 * since the ticket was broadcast, unless it is too close to the day the script
 * allows between the anchor and the arming's confirmation; then `tip`. The
 * work carries over either way: the challenge is the ticket's, not the anchor.
 */
export function planArm(
  config: RgbppConfig,
  terms: LaunchTerms,
  paid: MinerCell,
  creating: Uint8Array,
  tip: number,
  admission: Uint8Array,
): Plan {
  if (admission.length !== 96) throw new RangeError("an admission is the registration txid and a 64-byte certificate");
  if (paid.data.state !== "paid") throw new Error("only a paid miner cell is armed this way");
  if (tip < terms.h0) throw new RangeError("the launch has not opened yet");
  const anchor = armAnchor(paid.data.anchor, terms.h0, tip);
  if (paid.seal.vout !== TICKET_VOUT) throw new Error("a paid cell is sealed to its ticket's output 1");
  if (displayTxid(creating) !== paid.seal.txid) {
    throw new Error("the transaction given is not the one that created this miner cell");
  }
  return finish(config, {
    virtualTx: {
      inputs: [paid.outPoint],
      outputs: [{ capacity: paid.capacity - CKB_FEE, lock: pendingLock(config, TICKET_VOUT), type: mintScript(config, terms) }],
      outputsData: [encodeMinerCell({ state: "armed", nonce: 0n, anchor, ticket: paid.seal.txid })],
    },
    btcOutputs: [{ kind: "seal", value: SEAL_SATS }],
    sealsSpent: [paid.seal],
    needPaymasterCell: false,
    sumInputsCapacity: paid.capacity,
    btcfunWitness: ccc.hexFrom(ccc.bytesConcat(admission, creating)),
  });
}

/**
 * Blocks an arming may take to confirm, kept clear of the script's day of
 * grace (`ANCHOR_GRACE_BLOCKS`): past it the arming would fail and strand the
 * cell, so an older anchor is replaced by the tip.
 */
export const ARM_ANCHOR_MARGIN = 36;

/** The anchor an arming declares: the ticket's while it is safely fresh, else `tip`. */
export function armAnchor(ticketAnchor: number, h0: number, tip: number): number {
  const fresh = ticketAnchor >= h0 && tip - ticketAnchor <= ANCHOR_GRACE_BLOCKS - ARM_ANCHOR_MARGIN;
  return fresh ? ticketAnchor : tip;
}
