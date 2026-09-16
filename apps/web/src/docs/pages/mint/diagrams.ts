/* The mint circuit, as data. Output order and amounts follow
 * `lib/rgbpp/operations.ts` (`planTicket`, `planMint`) and `bitcoin.ts`:
 * commitment at 0, seals next, then payments, then change. */

import type { DiagramSpec } from "../../../components/diagram/model";
import { group } from "../../../lib/format";
import { SEAL_SATS } from "../../../lib/rgbpp/operations";
import { ANCHOR_GRACE_BLOCKS, MIN_CLZ, PLATFORM_FEE_SATS, PROMOTER_SATS } from "../../../lib/standard";

const seal = group(SEAL_SATS);

export const CIRCUIT: DiagramSpec = {
  title: "The mint circuit: open, ticket, mine, mint",
  description:
    `You open a miner cell once per launch. A ticket is a Bitcoin transaction paying ${group(PROMOTER_SATS)} sats to the promoter ` +
    `and ${group(PLATFORM_FEE_SATS)} to the platform; once it confirms, the RGB++ queue proves it to CKB, where the mint script checks ` +
    `both payments and that the anchor is at most ${ANCHOR_GRACE_BLOCKS} blocks behind the confirming block, then arms the cell. ` +
    `You mine in the browser, then sign a mint transaction that spends the ticket output. The mint script accepts it only if ` +
    `the hash has at least ${MIN_CLZ} leading zero bits and the amount is exactly the standard reward; otherwise nothing mints.`,
  lanes: [
    { id: "you", label: "You · browser", tone: "violet" },
    { id: "btc", label: "Bitcoin", tone: "amber" },
    { id: "queue", label: "RGB++ queue", tone: "cyan" },
    { id: "ckb", label: "CKB · mint script", tone: "mint" },
  ],
  nodes: [
    { id: "start", lane: "you", row: 0, kind: "terminal", label: "Pick a launch", tone: "violet" },
    { id: "open", lane: "you", row: 1, kind: "process", label: "Open a miner cell", detail: "once per launch", tone: "violet" },
    { id: "idle", lane: "ckb", row: 1, kind: "process", label: "Miner cell · idle", detail: "sealed to an output you own", tone: "mint" },
    { id: "ticket", lane: "you", row: 2, kind: "process", label: "Buy a ticket", detail: "sign one Bitcoin transaction", tone: "violet" },
    {
      id: "ticketTx",
      lane: "btc",
      row: 2,
      kind: "process",
      label: "Ticket transaction",
      detail: `${group(PROMOTER_SATS)} → promoter\n${group(PLATFORM_FEE_SATS)} → platform`,
      tone: "amber",
    },
    { id: "mine", lane: "you", row: 3, kind: "process", label: "Mine", detail: "the reward for your best hash shows live", tone: "violet" },
    { id: "confirmed", lane: "btc", row: 3, kind: "process", label: "Confirmed in a block", tone: "amber" },
    { id: "prove1", lane: "queue", row: 3, kind: "process", label: "Proves it to CKB", detail: "SPV proof, then submits", tone: "cyan" },
    { id: "paid", lane: "ckb", row: 4, kind: "decision", label: "Promoter and platform paid?" },
    { id: "anchor", lane: "ckb", row: 5, kind: "decision", label: `Anchor ≤ ${ANCHOR_GRACE_BLOCKS} blocks old?` },
    { id: "unarmed", lane: "queue", row: 5, kind: "terminal", label: "Rejected: not armed", tone: "rose" },
    { id: "armed", lane: "ckb", row: 6, kind: "process", label: "Miner cell · armed", detail: "the ticket's rate is fixed", tone: "mint" },
    { id: "mint", lane: "you", row: 7, kind: "process", label: "Mint", detail: "sign the transaction that spends the ticket", tone: "violet" },
    { id: "mintTx", lane: "btc", row: 8, kind: "process", label: "Mint transaction", detail: "commits to the CKB mint", tone: "amber" },
    { id: "prove2", lane: "queue", row: 9, kind: "process", label: "Proves it to CKB", detail: "after it confirms", tone: "cyan" },
    { id: "work", lane: "ckb", row: 10, kind: "decision", label: `Hash ≥ ${MIN_CLZ} zero bits?` },
    { id: "amount", lane: "ckb", row: 11, kind: "decision", label: "Amount exactly the reward?" },
    { id: "nothing", lane: "queue", row: 11, kind: "terminal", label: "Rejected: nothing mints", tone: "rose" },
    { id: "minted", lane: "ckb", row: 12, kind: "terminal", label: "Tokens in your output", tone: "mint" },
    { id: "again", lane: "you", row: 12, kind: "note", label: "The next ticket is a new transaction." },
  ],
  edges: [
    { from: "start", to: "open" },
    { from: "open", to: "idle", label: "RGB++" },
    { from: "open", to: "ticket" },
    { from: "ticket", to: "ticketTx" },
    { from: "ticket", to: "mine", label: "mining starts" },
    { from: "ticketTx", to: "confirmed" },
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
  title: "The miner cell: idle, armed, idle again",
  description:
    "A miner cell's data is 13 bytes: one byte of state (0 idle, 1 armed), the 8-byte nonce of the last mint and the " +
    "4-byte anchor height of the current ticket. A ticket turns it from idle to armed and records the anchor; a mint " +
    "returns it to idle carrying the winning nonce.",
  laneWidth: 300,
  lanes: [
    { id: "a", label: "after opening", tone: "slate" },
    { id: "b", label: "after a ticket", tone: "slate" },
    { id: "c", label: "after the mint", tone: "slate" },
  ],
  nodes: [
    { id: "idle", lane: "a", row: 0, kind: "cell", label: "Miner cell · idle", tone: "mint", fields: minerCellFields("0", "0", "0"), bytes: MINER_BYTES },
    { id: "armed", lane: "b", row: 0, kind: "cell", label: "Miner cell · armed", tone: "amber", fields: minerCellFields("1", "kept", "the tip"), bytes: MINER_BYTES },
    { id: "done", lane: "c", row: 0, kind: "cell", label: "Miner cell · idle", tone: "mint", fields: minerCellFields("0", "winning", "kept"), bytes: MINER_BYTES },
  ],
  edges: [
    { from: "idle", to: "armed", label: "ticket" },
    { from: "armed", to: "done", label: "mint" },
  ],
};

export const TICKET_TX: DiagramSpec = {
  title: "Inside a ticket: one Bitcoin transaction, one CKB transaction",
  description:
    `The ticket's Bitcoin transaction spends the UTXO the idle miner cell is sealed to, plus your coins. Its outputs are, in order: ` +
    `0, an OP_RETURN carrying the commitment to the CKB transaction; 1, a ${seal}-sat seal the armed miner cell is bound to, which is ` +
    `the mining challenge; 2, ${group(PROMOTER_SATS)} sats to the promoter; 3, ${group(PLATFORM_FEE_SATS)} sats to the platform; then ` +
    `your change. The CKB transaction consumes the idle miner cell and creates it again, armed, sealed to output 1.`,
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
      inputs: [
        { id: "cell", label: "Idle miner cell's UTXO", value: seal, detail: "spending it is what moves the cell", tone: "violet" },
        { id: "coins", label: "Your coins", detail: "pay for the ticket and the fee", tone: "slate" },
      ],
      outputs: [
        { id: "commit", label: "0 · OP_RETURN", value: "32 B", detail: "commitment to the CKB transaction", tone: "cyan" },
        { id: "seal", label: "1 · seal: armed cell", value: seal, detail: "the challenge you mine against", tone: "violet" },
        { id: "promoter", label: "2 · promoter", value: group(PROMOTER_SATS), detail: "95 % of the ticket", tone: "amber" },
        { id: "platform", label: "3 · platform fee", value: group(PLATFORM_FEE_SATS), detail: "5 %, to a script fixed in the mint script", tone: "amber" },
        { id: "change", label: "4 · your change", value: "rest", tone: "slate" },
      ],
    },
    {
      id: "ckb",
      lane: "tx",
      row: 1,
      kind: "transaction",
      label: "CKB · the transaction it commits to",
      tone: "mint",
      inputs: [{ id: "idle", label: "Miner cell · idle", detail: "state 0 · the old nonce", tone: "mint" }],
      outputs: [{ id: "armed", label: "Miner cell · armed", detail: "state 1 · nonce kept · anchor = tip", tone: "mint" }],
    },
  ],
  edges: [
    { from: "btc.commit", to: "ckb", kind: "commit", toSide: "right" },
    { from: "ckb.idle", to: "btc.cell", kind: "seal" },
    { from: "ckb.armed", to: "btc.seal", kind: "seal" },
  ],
};

export const MINT_TX: DiagramSpec = {
  title: "Inside a mint: the ticket is spent, the tokens appear",
  description:
    `The mint's Bitcoin transaction spends the ticket output (the armed miner cell's UTXO), your existing token UTXO if you hold ` +
    `this token already, and your coins. Outputs: 0, the OP_RETURN commitment; 1, a seal for the miner cell, idle again; 2, a seal ` +
    `for your tokens; on a first mint, a fee to the RGB++ paymaster for the new cell's CKB capacity; then change. On CKB the armed ` +
    `miner cell becomes idle carrying the nonce, and your token cell grows by exactly the reward.`,
  laneWidth: 680,
  lanes: [{ id: "tx" }],
  nodes: [
    {
      id: "btc",
      lane: "tx",
      row: 0,
      kind: "transaction",
      label: "Bitcoin · mint transaction",
      tone: "amber",
      inputs: [
        { id: "ticket", label: "The ticket output", value: seal, detail: "the armed miner cell's UTXO", tone: "violet" },
        { id: "held", label: "Your token UTXO", value: seal, detail: "if you already hold this token", tone: "violet" },
        { id: "coins", label: "Your coins", detail: "pay the fee", tone: "slate" },
      ],
      outputs: [
        { id: "commit", label: "0 · OP_RETURN", value: "32 B", detail: "commitment to the CKB transaction", tone: "cyan" },
        { id: "minerSeal", label: "1 · seal: miner cell", value: seal, detail: "idle again, ready for a ticket", tone: "violet" },
        { id: "tokenSeal", label: "2 · seal: your tokens", value: seal, detail: "where the balance now lives", tone: "violet" },
        { id: "paymaster", label: "3 · paymaster fee", detail: "first mint only: pays the new cell's CKB capacity", tone: "amber" },
        { id: "change", label: "last · your change", value: "rest", tone: "slate" },
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
        { id: "balance", label: "Token cell", detail: "your balance, if any", tone: "mint" },
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
