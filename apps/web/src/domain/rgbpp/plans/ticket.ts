/* The ticket: the round's one payment, planned.
 *
 * Output order, as in every plan: the commitment (OP_RETURN) at 0, then the
 * seals, then payments, then change. The miner cell is sealed to output 1,
 * which is also the mining challenge from the moment the ticket is broadcast.
 */

import { NEW_CELL, REUSE, type Split } from "@/domain/protocol";
import type { RgbppConfig } from "../config";
import { mintScript, type LaunchTerms } from "../launch";
import { pendingLock } from "../seal";
import { CKB_FEE, minerCellCapacity } from "../cells/capacity";
import { encodeMinerCell, TICKET_VOUT, type MinerCell } from "../cells/miner";
import { finish, SEAL_SATS, type Paymaster, type Plan, type PlannedOutput } from "./plan";

/** The payments one ticket makes, in the order the Bitcoin transaction lists them. */
function ticketPayments(config: RgbppConfig, terms: LaunchTerms, price: Split): PlannedOutput[] {
  return [
    { kind: "ticket", script: terms.promoterScript, value: price.promoter },
    { kind: "fee", address: config.platformAddress, value: price.platform },
  ];
}

export interface TicketRequest {
  /** The idle miner cell to re-arm, or null when this wallet has none on the launch. */
  idle: MinerCell | null;
  /** The paymaster, for a round that creates its miner cell. */
  paymaster: Paymaster | null;
  /** The height the ticket's reward is priced at; a paid cell keeps it for its arming. */
  tip: number;
}

/**
 * The ticket: the round's one payment, and the only transaction in it that
 * pays anyone but the network.
 *
 * With an idle miner cell it re-arms that cell at output 1, anchored at `tip`
 * — the height its reward will be priced at — and pays the re-arm split. The
 * script accepts an anchor up to a day behind the block that confirms the
 * ticket; if the ticket sat unconfirmed longer, only the empty cell is lost.
 *
 * Without one it creates the cell, `paid`, at output 1, from the paymaster's
 * capacity, and pays the new-cell split plus the paymaster. It spends no
 * sealed UTXO, so nothing on CKB verifies it now; the cell is armed by a
 * second transaction once this one has settled (`planArm`), and the script
 * checks this payment then. Its output 1 is the challenge from the start, so
 * mining does not wait for either.
 */
export function planTicket(config: RgbppConfig, terms: LaunchTerms, request: TicketRequest): Plan {
  const { idle, paymaster, tip } = request;
  if (tip < terms.h0) throw new RangeError("the launch has not opened yet");
  const mint = mintScript(config, terms);

  if (idle === null) {
    if (!paymaster) throw new Error("a ticket that creates its miner cell needs the paymaster");
    return finish(config, {
      virtualTx: {
        inputs: [],
        outputs: [{ capacity: minerCellCapacity(config, terms), lock: pendingLock(config, TICKET_VOUT), type: mint }],
        outputsData: [encodeMinerCell({ state: "paid", nonce: 0n, anchor: tip })],
      },
      btcOutputs: [
        { kind: "seal", value: SEAL_SATS },
        ...ticketPayments(config, terms, NEW_CELL),
        { kind: "paymaster", address: paymaster.address, value: paymaster.feeSats },
      ],
      sealsSpent: [],
      needPaymasterCell: true,
      sumInputsCapacity: 0n,
    });
  }

  if (idle.data.state !== "idle") throw new Error("this miner cell already holds a ticket");
  return finish(config, {
    virtualTx: {
      inputs: [idle.outPoint],
      outputs: [{ capacity: idle.capacity - CKB_FEE, lock: pendingLock(config, TICKET_VOUT), type: mint }],
      outputsData: [encodeMinerCell({ state: "armed", nonce: idle.data.nonce, anchor: tip })],
    },
    btcOutputs: [{ kind: "seal", value: SEAL_SATS }, ...ticketPayments(config, terms, REUSE)],
    sealsSpent: [idle.seal],
    needPaymasterCell: false,
    sumInputsCapacity: idle.capacity,
  });
}
