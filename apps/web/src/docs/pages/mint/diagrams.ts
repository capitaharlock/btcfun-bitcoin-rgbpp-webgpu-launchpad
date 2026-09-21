/* The mint circuit, as data. Output order and amounts follow
 * `lib/rgbpp/operations.ts` (`planTicket`, `planArm`, `planMint`) and
 * `bitcoin.ts`: commitment at 0, seals next, then payments, then change. */

import type { DiagramSpec } from "../../../components/diagram/model";
import { group } from "../../../lib/format";
import { SEAL_SATS } from "../../../lib/rgbpp/operations";
import { ANCHOR_GRACE_BLOCKS, MIN_CLZ, NEW_CELL, REUSE, TICKET_SATS } from "../../../lib/standard";

const seal = group(SEAL_SATS);

export const CIRCUIT: DiagramSpec = {
  title: "The mint circuit: ticket, arm, mine, mint",
  description:
    `A round starts with the ticket, ${group(TICKET_SATS)} sats in one Bitcoin transaction. With an idle miner cell it arms the ` +
    `cell directly; without one it creates the cell, paid, and a second transaction — network fee only — arms it once the ` +
    `ticket has confirmed. The mint script checks, when the cell is armed, that the ticket paid the promoter and the platform ` +
    `and that the anchor is at most ${ANCHOR_GRACE_BLOCKS} blocks behind the arming block. You mine in the browser from the ` +
    `moment the arming is sent, then sign a mint that pays only the network. The mint script accepts it only if the hash has ` +
    `at least ${MIN_CLZ} leading zero bits and the amount is exactly the standard reward; otherwise nothing mints.`,
  lanes: [
    { id: "you", label: "You · browser", tone: "violet" },
    { id: "btc", label: "Bitcoin", tone: "amber" },
    { id: "queue", label: "RGB++ queue", tone: "cyan" },
    { id: "ckb", label: "CKB · mint script", tone: "mint" },
  ],
  nodes: [
    { id: "start", lane: "you", row: 0, kind: "terminal", label: "Pick a launch", tone: "violet" },
    { id: "ticket", lane: "you", row: 1, kind: "process", label: "Sign the ticket", detail: `${group(TICKET_SATS)} sats + network`, tone: "violet" },
    {
      id: "ticketTx",
      lane: "btc",
      row: 1,
      kind: "process",
      label: "Ticket transaction",
      detail: `new cell: ${group(NEW_CELL.promoter)} · ${group(NEW_CELL.platform)} · ${group(NEW_CELL.paymaster)}\nre-arm: ${group(REUSE.promoter)} · ${group(REUSE.platform)}`,
      tone: "amber",
    },
    { id: "paidCell", lane: "ckb", row: 2, kind: "process", label: "Miner cell · paid", detail: "first rounds: created by the ticket", tone: "mint" },
    { id: "arm", lane: "you", row: 3, kind: "process", label: "Sign the arming", detail: "network fee only", tone: "violet" },
    { id: "mine", lane: "you", row: 4, kind: "process", label: "Mine", detail: "the reward for your best hash shows live", tone: "violet" },
    { id: "confirmed", lane: "btc", row: 4, kind: "process", label: "Confirmed in a block", tone: "amber" },
    { id: "prove1", lane: "queue", row: 4, kind: "process", label: "Proves it to CKB", detail: "SPV proof, then submits", tone: "cyan" },
    { id: "paid", lane: "ckb", row: 5, kind: "decision", label: "Promoter and platform paid?" },
    { id: "anchor", lane: "ckb", row: 6, kind: "decision", label: `Anchor ≤ ${ANCHOR_GRACE_BLOCKS} blocks old?` },
    { id: "unarmed", lane: "queue", row: 6, kind: "terminal", label: "Rejected: not armed", tone: "rose" },
    { id: "armed", lane: "ckb", row: 7, kind: "process", label: "Miner cell · armed", detail: "the ticket's rate is fixed", tone: "mint" },
    { id: "mint", lane: "you", row: 8, kind: "process", label: "Sign the mint", detail: "network fee only", tone: "violet" },
    { id: "mintTx", lane: "btc", row: 9, kind: "process", label: "Mint transaction", detail: "commits to the CKB mint", tone: "amber" },
    { id: "prove2", lane: "queue", row: 10, kind: "process", label: "Proves it to CKB", detail: "after it confirms", tone: "cyan" },
    { id: "work", lane: "ckb", row: 11, kind: "decision", label: `Hash ≥ ${MIN_CLZ} zero bits?` },
    { id: "amount", lane: "ckb", row: 12, kind: "decision", label: "Amount exactly the reward?" },
    { id: "nothing", lane: "queue", row: 12, kind: "terminal", label: "Rejected: nothing mints", tone: "rose" },
    { id: "minted", lane: "ckb", row: 13, kind: "terminal", label: "Tokens in your output", tone: "mint" },
    { id: "again", lane: "you", row: 13, kind: "note", label: "The next ticket is a new transaction." },
  ],
  edges: [
    { from: "start", to: "ticket" },
    { from: "ticket", to: "ticketTx" },
    { from: "ticketTx", to: "paidCell", label: "no cell yet", fromSide: "bottom", toSide: "left" },
    { from: "paidCell", to: "arm", label: "after 1 block", fromSide: "left", toSide: "right" },
    { from: "ticket", to: "arm", label: "idle cell: armed at once" },
    { from: "arm", to: "mine", label: "mining starts" },
    { from: "arm", to: "confirmed", fromSide: "right", toSide: "top" },
    { from: "confirmed", to: "prove1" },
    { from: "prove1", to: "paid", fromSide: "right", toSide: "top" },
    { from: "paid", to: "anchor", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "paid", to: "unarmed", kind: "no", fromSide: "left", toSide: "top" },
    { from: "anchor", to: "unarmed", kind: "no", fromSide: "left", toSide: "right" },
    { from: "anchor", to: "armed", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "mine", to: "mint" },
    { from: "armed", to: "mint", label: "settled", fromSide: "left", toSide: "right" },
    { from: "mint", to: "mintTx", fromSide: "bottom", toSide: "top" },
    { from: "mintTx", to: "prove2", fromSide: "right", toSide: "top" },
    { from: "prove2", to: "work", fromSide: "right", toSide: "top" },
    { from: "work", to: "amount", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "work", to: "nothing", kind: "no", fromSide: "left", toSide: "top" },
    { from: "amount", to: "nothing", kind: "no", fromSide: "left", toSide: "right" },
    { from: "amount", to: "minted", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "minted", to: "again", label: "repeat", fromSide: "left", toSide: "right" },
  ],
};

const minerCellFields = (state: string, nonce: string, anchor: string) => [
  { key: "lock", value: "RGB++ → a UTXO of yours" },
  { key: "type", value: "mint script + launch terms" },
  { key: "data", value: `${state} · nonce ${nonce} · anchor ${anchor}` },
];

const MINER_BYTES = [
  { label: "state", bytes: 1 },
  { label: "nonce", bytes: 8 },
  { label: "anchor", bytes: 4 },
];

export const MINER_CELL: DiagramSpec = {
  title: "The miner cell: paid, armed, then gone or idle",
  description:
    "A miner cell's data is 13 bytes: one byte of state (0 idle, 1 armed, 2 paid), the 8-byte nonce of the last mint and " +
    "the 4-byte anchor height of the current ticket. A ticket without a cell creates one, paid; arming it records the " +
    "anchor. A first mint turns the cell's capacity into the token cell, the nonce riding in a witness; a later mint returns " +
    "it idle carrying the winning nonce, ready for a ticket that re-arms it.",
  laneWidth: 300,
  lanes: [
    { id: "a", label: "after the ticket", tone: "slate" },
    { id: "b", label: "after arming", tone: "slate" },
    { id: "c", label: "after a later mint", tone: "slate" },
  ],
  nodes: [
    { id: "paid", lane: "a", row: 0, kind: "cell", label: "Miner cell · paid", tone: "mint", fields: minerCellFields("2", "0", "0"), bytes: MINER_BYTES },
    { id: "armed", lane: "b", row: 0, kind: "cell", label: "Miner cell · armed", tone: "amber", fields: minerCellFields("1", "kept", "the tip"), bytes: MINER_BYTES },
    { id: "done", lane: "c", row: 0, kind: "cell", label: "Miner cell · idle", tone: "mint", fields: minerCellFields("0", "winning", "kept"), bytes: MINER_BYTES },
  ],
  edges: [
    { from: "paid", to: "armed", label: "arm" },
    { from: "armed", to: "done", label: "mint" },
  ],
};

export const TICKET_TX: DiagramSpec = {
  title: "Inside a ticket that creates its miner cell",
  description:
    `A first ticket spends only your coins. Its outputs are, in order: 0, an OP_RETURN carrying the commitment to the CKB ` +
    `transaction; 1, a ${seal}-sat seal the new miner cell is bound to; 2, ${group(NEW_CELL.promoter)} sats to the promoter; ` +
    `3, ${group(NEW_CELL.platform)} sats to the platform; 4, ${group(NEW_CELL.paymaster)} sats to the RGB++ paymaster, whose ` +
    `CKB capacity becomes the cell; then your change. The cell is created paid; the arming transaction, which spends output 1, ` +
    `carries this transaction whole so the mint script can check what it paid. A ticket on an idle cell instead spends that ` +
    `cell's output, pays ${group(REUSE.promoter)} and ${group(REUSE.platform)}, and arms the cell at once.`,
  laneWidth: 680,
  lanes: [{ id: "tx" }],
  nodes: [
    {
      id: "btc",
      lane: "tx",
      row: 0,
      kind: "transaction",
      label: "Bitcoin · ticket transaction",
      tone: "amber",
      inputs: [{ id: "coins", label: "Your coins", detail: "pay for the ticket and the fee", tone: "slate" }],
      outputs: [
        { id: "commit", label: "0 · OP_RETURN", value: "32 B", detail: "commitment to the CKB transaction", tone: "cyan" },
        { id: "seal", label: "1 · seal: paid cell", value: seal, detail: "spent by the arming", tone: "violet" },
        { id: "promoter", label: "2 · promoter", value: group(NEW_CELL.promoter), detail: "the rest after the platform", tone: "amber" },
        { id: "platform", label: "3 · platform", value: group(NEW_CELL.platform), detail: "11 %, to a script fixed in the mint script", tone: "amber" },
        { id: "paymaster", label: "4 · paymaster", value: group(NEW_CELL.paymaster), detail: "the new cell's CKB capacity", tone: "amber" },
        { id: "change", label: "5 · your change", value: "rest", tone: "slate" },
      ],
    },
    {
      id: "ckb",
      lane: "tx",
      row: 1,
      kind: "transaction",
      label: "CKB · the transaction it commits to",
      tone: "mint",
      inputs: [{ id: "cap", label: "Paymaster capacity", detail: "added by the RGB++ queue", tone: "slate" }],
      outputs: [{ id: "paid", label: "Miner cell · paid", detail: "state 2 · armed by the next transaction", tone: "mint" }],
    },
  ],
  edges: [
    { from: "btc.commit", to: "ckb", kind: "commit", toSide: "right" },
    { from: "ckb.paid", to: "btc.seal", kind: "seal" },
  ],
};

export const MINT_TX: DiagramSpec = {
  title: "Inside a mint: the ticket is spent, the tokens appear",
  description:
    `The mint's Bitcoin transaction spends the armed miner cell's output, your existing token output if you hold this token ` +
    `already, and your coins — for the network fee, nothing else. On a first mint the miner cell's capacity becomes your token ` +
    `cell, sealed to output 1, and the nonce travels in a witness; the next round's ticket creates a new cell. On a later mint ` +
    `output 1 seals the miner cell, idle again with the nonce, and output 2 your token cell, grown by exactly the reward.`,
  laneWidth: 680,
  lanes: [{ id: "tx" }],
  nodes: [
    {
      id: "btc",
      lane: "tx",
      row: 0,
      kind: "transaction",
      label: "Bitcoin · a later mint",
      tone: "amber",
      inputs: [
        { id: "ticket", label: "The armed cell's output", value: seal, detail: "the ticket's challenge", tone: "violet" },
        { id: "held", label: "Your token output", value: seal, detail: "your balance", tone: "violet" },
        { id: "coins", label: "Your coins", detail: "pay the network fee", tone: "slate" },
      ],
      outputs: [
        { id: "commit", label: "0 · OP_RETURN", value: "32 B", detail: "commitment to the CKB transaction", tone: "cyan" },
        { id: "minerSeal", label: "1 · seal: miner cell", value: seal, detail: "idle again, ready for a ticket", tone: "violet" },
        { id: "tokenSeal", label: "2 · seal: your tokens", value: seal, detail: "where the balance now lives", tone: "violet" },
        { id: "change", label: "3 · your change", value: "rest", tone: "slate" },
      ],
    },
    {
      id: "ckb",
      lane: "tx",
      row: 1,
      kind: "transaction",
      label: "CKB · the transaction it commits to",
      tone: "mint",
      inputs: [
        { id: "armed", label: "Miner cell · armed", detail: "the ticket, its anchor inside", tone: "mint" },
        { id: "balance", label: "Token cell", detail: "your balance", tone: "mint" },
      ],
      outputs: [
        { id: "idle", label: "Miner cell · idle", detail: "carries the winning nonce", tone: "mint" },
        { id: "tokens", label: "Token cell (xUDT)", detail: "balance + reward, exactly", tone: "mint" },
      ],
    },
  ],
  edges: [
    { from: "btc.commit", to: "ckb", kind: "commit", toSide: "right" },
    { from: "ckb.armed", to: "btc.ticket", kind: "seal" },
    { from: "ckb.balance", to: "btc.held", kind: "seal" },
    { from: "ckb.idle", to: "btc.minerSeal", kind: "seal" },
    { from: "ckb.tokens", to: "btc.tokenSeal", kind: "seal" },
  ],
};
