/* The miner cell: one miner's place in one launch, as the mint script reads it.
 *
 * Its data is laid out byte for byte as `contracts/mint-core` `MinerCell`
 * expects, so this codec and the Rust one must agree; the tests pin the layout.
 * A cell armed from `paid` also names its ticket, whose output 1 — not the
 * cell's own seal — is the mining challenge.
 */

import { ccc } from "@ckb-ccc/core";

import { txidFromInternal, txidToInternal } from "../../bitcoin/txid";
import type { Seal } from "../seal";
import type { SealedCell } from "./sealed";

/**
 * `paid`: created by a ticket payment, waiting to be armed (`contracts/mint-core`
 * `MinerState::Paid`). The payment is checked when it is armed, against the
 * transaction that created it.
 */
export type MinerStateName = "idle" | "armed" | "paid";

/** The output a ticket seals the miner cell to (`contracts/mint-core` `PAID_SEAL_VOUT`). */
export const TICKET_VOUT = 1;

const STATE_BYTES: Record<MinerStateName, number> = { idle: 0, armed: 1, paid: 2 };
const STATE_NAMES: MinerStateName[] = ["idle", "armed", "paid"];

/** A miner cell's data, as `contracts/mint-core` `MinerCell` lays it out. */
export interface MinerCellData {
  state: MinerStateName;
  /** The nonce of the last mint. */
  nonce: bigint;
  /** The height the current ticket's reward is priced at. */
  anchor: number;
  /**
   * On a cell armed from `paid` only: the ticket's txid (displayed order),
   * whose output 1 is the challenge instead of the cell's own seal. That is
   * what lets mining start the moment the ticket is broadcast.
   */
  ticket?: string;
}

export interface MinerCell extends SealedCell {
  data: MinerCellData;
}

/** A miner cell's data size, and the size of one that names its ticket. */
const CELL_BYTES = 13;
const NAMED_BYTES = CELL_BYTES + 32;

export function encodeMinerCell(cell: MinerCellData): ccc.Hex {
  const head = ccc.bytesConcat([STATE_BYTES[cell.state]], ccc.numLeToBytes(cell.nonce, 8), ccc.numLeToBytes(cell.anchor, 4));
  if (cell.ticket === undefined) return ccc.hexFrom(head);
  if (cell.state !== "armed") throw new Error("only an armed miner cell names its ticket");
  return ccc.hexFrom(ccc.bytesConcat(head, txidToInternal(cell.ticket)));
}

export function decodeMinerCell(data: ccc.HexLike): MinerCellData | null {
  const bytes = ccc.bytesFrom(data);
  if ((bytes.length !== CELL_BYTES && bytes.length !== NAMED_BYTES) || bytes[0] >= STATE_NAMES.length) return null;
  const cell: MinerCellData = {
    state: STATE_NAMES[bytes[0]],
    nonce: ccc.numLeFromBytes(bytes.slice(1, 9)),
    anchor: Number(ccc.numLeFromBytes(bytes.slice(9, CELL_BYTES))),
  };
  if (bytes.length === NAMED_BYTES) {
    if (cell.state !== "armed") return null;
    cell.ticket = txidFromInternal(bytes.slice(CELL_BYTES));
  }
  return cell;
}

/** The Bitcoin output an armed cell is mined against: the ticket it names, or its own seal. */
export function challengeOutpoint(cell: MinerCell): Seal {
  return cell.data.ticket ? { txid: cell.data.ticket, vout: TICKET_VOUT } : cell.seal;
}
