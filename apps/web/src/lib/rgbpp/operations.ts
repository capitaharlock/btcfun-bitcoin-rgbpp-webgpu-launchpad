/* The RGB++ operations of a btc.fun token, as plans — one import for all of them.
 *
 * Building a plan touches no key and no network, so every rule about capacity,
 * output order and fees is unit-testable beside the part that owns it: the
 * cells a token has (`./cells/`) and the plan of each operation (`./plans/`).
 * This file is their public surface, and the path the Node scripts load
 * (`scripts/rgbpp/kit.mjs`).
 *
 * Output order in every Bitcoin transaction: the commitment (OP_RETURN) at 0,
 * then the seals in the order the plan lists them, then payments, then change.
 * The miner cell and the tokens are sealed to *different* outputs: a UTXO that
 * carried both would force every later transfer to move the miner cell too,
 * and a wallet that spent it without doing so would strand the cell forever.
 */

export type { SealedCell } from "./cells/sealed";
export {
  challengeOutpoint,
  decodeMinerCell,
  encodeMinerCell,
  TICKET_VOUT,
  type MinerCell,
  type MinerCellData,
  type MinerStateName,
} from "./cells/miner";
export { decodeAmount, encodeAmount, type TokenCell } from "./cells/token";
export { CKB_FEE, MINER_FEE_RESERVE, minerCellCapacity, occupied, tokenCellCapacity } from "./cells/capacity";
export { SEAL_SATS, type Paymaster, type Plan, type PlannedOutput } from "./plans/plan";
export { planTicket, type TicketRequest } from "./plans/ticket";
export { ARM_ANCHOR_MARGIN, armAnchor, planArm } from "./plans/arm";
export { planMint, type MintRequest } from "./plans/mint";
export { planTransfer, type TransferRequest } from "./plans/transfer";
