/* The RGB++ operations of a btc.fun token, as plans.
 *
 * A plan is everything both chains need, decided before anything is signed:
 * the CKB transaction the Bitcoin transaction will commit to, the sealed
 * Bitcoin outputs it expects, and the payments that go with it. Building a
 * plan touches no key and no network, so every rule about capacity, output
 * order and fees is unit-testable here; `bitcoin.ts` turns a plan into a signed
 * transaction and `service.ts` hands the CKB side to the RGB++ queue.
 *
 * Output order in every Bitcoin transaction: the commitment (OP_RETURN) at 0,
 * then the seals in the order the plan lists them, then payments, then change.
 * The miner cell and the tokens are sealed to *different* outputs: a UTXO that
 * carried both would force every later transfer to move the miner cell too,
 * and a wallet that spent it without doing so would strand the cell forever.
 */

import { ccc } from "@ckb-ccc/core";
import { sha256 } from "@noble/hashes/sha2";

import { ANCHOR_GRACE_BLOCKS, NEW_CELL, REUSE, type Split } from "../standard";
import { commitment, type VirtualTx } from "./commitment";
import type { RgbppConfig } from "./config";
import { mintScript, tokenScript, type LaunchTerms } from "./launch";
import { pendingLock, reverseHex, type Seal } from "./seal";

/** Every sealed Bitcoin output carries this much; the RGB++ tooling's default. */
export const SEAL_SATS = 546;
/**
 * CKB fee each operation takes from the miner or token cell's spare capacity.
 * A mint's CKB transaction is about 2 KB once the Bitcoin transaction and its
 * proof are in the witness, so this is several times the minimum fee rate.
 */
export const CKB_FEE = 100_000n;
/** Spare capacity a miner cell is opened with, spent on fees over its life. */
export const MINER_FEE_RESERVE = ccc.fixedPointFrom(10);

/**
 * `paid`: created by a ticket payment, waiting to be armed (`contracts/mint-core`
 * `MinerState::Paid`). The payment is checked when it is armed, against the
 * transaction that created it.
 */
export type MinerStateName = "idle" | "armed" | "paid";

/** The output a ticket seals the miner cell to (`contracts/mint-core` `PAID_SEAL_VOUT`). */
export const TICKET_VOUT = 1;
const PLACEHOLDER_NAME = "0".repeat(64);

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

/** A miner cell's data size, and the size of one that names its ticket. */
const CELL_BYTES = 13;
const NAMED_BYTES = CELL_BYTES + 32;

export function encodeMinerCell(cell: MinerCellData): ccc.Hex {
  const head = ccc.bytesConcat([STATE_BYTES[cell.state]], ccc.numLeToBytes(cell.nonce, 8), ccc.numLeToBytes(cell.anchor, 4));
  if (cell.ticket === undefined) return ccc.hexFrom(head);
  if (cell.state !== "armed") throw new Error("only an armed miner cell names its ticket");
  return ccc.hexFrom(ccc.bytesConcat(head, ccc.bytesFrom(reverseHex(cell.ticket), "hex")));
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
    cell.ticket = reverseHex(ccc.hexFrom(bytes.slice(CELL_BYTES)).slice(2));
  }
  return cell;
}

/** The Bitcoin output an armed cell is mined against: the ticket it names, or its own seal. */
export function challengeOutpoint(cell: MinerCell): Seal {
  return cell.data.ticket ? { txid: cell.data.ticket, vout: TICKET_VOUT } : cell.seal;
}

export function encodeAmount(atoms: bigint): ccc.Hex {
  return ccc.hexFrom(ccc.numLeToBytes(atoms, 16));
}

export function decodeAmount(data: ccc.HexLike): bigint {
  return ccc.numLeFromBytes(ccc.bytesFrom(data).slice(0, 16));
}

/** A live cell the plan consumes, with the Bitcoin output it is sealed to. */
export interface SealedCell {
  outPoint: ccc.OutPointLike;
  capacity: bigint;
  seal: Seal;
}

export interface TokenCell extends SealedCell {
  amount: bigint;
}

export interface MinerCell extends SealedCell {
  data: MinerCellData;
}

/** A Bitcoin output the plan needs besides the commitment. */
export type PlannedOutput =
  | { kind: "seal"; value: number }
  | { kind: "ticket"; script: Uint8Array; value: number }
  | { kind: "fee"; address: string; value: number }
  | { kind: "paymaster"; address: string; value: number }
  | { kind: "payment"; address: string; value: number };

export interface Plan {
  virtualTx: VirtualTx;
  cellDeps: ccc.CellDepLike[];
  commitment: ccc.Hex;
  /** Bitcoin outputs after the commitment, in order; seals come first. */
  btcOutputs: PlannedOutput[];
  /** Sealed UTXOs the Bitcoin transaction must spend. */
  sealsSpent: Seal[];
  /** The queue service adds a paymaster cell for capacity the inputs lack. */
  needPaymasterCell: boolean;
  sumInputsCapacity: bigint;
  /**
   * The btc.fun witness, placed past the inputs' witnesses where the queue
   * leaves it as written: the creating transaction when a paid cell is armed,
   * the nonce when a first mint dissolves the miner cell (`contracts/mint`).
   */
  btcfunWitness?: ccc.Hex;
}

export interface Paymaster {
  address: string;
  feeSats: number;
}

/**
 * Capacity a cell occupies, data included. CCC's `occupiedSize` counts the
 * output alone, and a cell holding less than output plus data is rejected by
 * every CKB node, so the data length is added here explicitly.
 */
export function occupied(output: ccc.CellOutputLike, data: ccc.HexLike): bigint {
  return ccc.fixedPointFrom(ccc.CellOutput.from({ ...output, capacity: 0 }).occupiedSize + ccc.bytesFrom(data).length);
}

/**
 * Capacity a miner cell is opened with: what it occupies once armed naming its
 * ticket — the largest it gets — plus its fee reserve.
 */
export function minerCellCapacity(config: RgbppConfig, terms: LaunchTerms): bigint {
  const lock = pendingLock(config, 1);
  const data = encodeMinerCell({ state: "armed", nonce: 0n, anchor: 0, ticket: PLACEHOLDER_NAME });
  return occupied({ lock, type: mintScript(config, terms) }, data) + MINER_FEE_RESERVE;
}

/** Capacity a token cell occupies. Tokens pay no fees; they travel with a plan's funding. */
export function tokenCellCapacity(config: RgbppConfig, terms: LaunchTerms): bigint {
  const token = tokenScript(config, mintScript(config, terms));
  return occupied({ lock: pendingLock(config, 1), type: token }, encodeAmount(0n)) + CKB_FEE;
}

function deps(config: RgbppConfig): ccc.CellDepLike[] {
  return [...config.rgbppLockDeps, config.xudtDep, config.mintDep];
}

function finish(
  config: RgbppConfig,
  parts: Omit<Plan, "commitment" | "cellDeps">,
): Plan {
  // The queue appends the paymaster's input but not the dependency its lock
  // needs; without it CKB cannot find the script and the job fails after the
  // Bitcoin side has already confirmed. Cell deps are outside the commitment.
  const cellDeps = parts.needPaymasterCell ? [...deps(config), config.paymasterLockDep] : deps(config);
  return { ...parts, cellDeps, commitment: commitment(parts.virtualTx) };
}


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

/**
 * Arm a paid miner cell: it moves to output 1 armed, naming its ticket as the
 * challenge, and the transaction pays nothing but the network. The ticket
 * transaction that created the cell rides in the btc.fun witness — stripped
 * of its witness data, as Bitcoin hashes it — so the script can check what it
 * paid.
 *
 * The anchor is the ticket's, which the miner has been shown the reward at
 * since the ticket was broadcast, unless it is too close to the day the script
 * allows between the anchor and the arming's confirmation; then `tip`. The
 * work carries over either way: the challenge is the ticket's, not the anchor.
 */
export function planArm(config: RgbppConfig, terms: LaunchTerms, paid: MinerCell, creating: Uint8Array, tip: number): Plan {
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
    btcfunWitness: ccc.hexFrom(creating),
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

/** A Bitcoin txid as explorers show it, from the transaction without witness data. */
export function displayTxid(stripped: Uint8Array): string {
  return ccc.hexFrom(sha256(sha256(stripped)).reverse()).slice(2);
}

export interface MintRequest {
  miner: MinerCell;
  /** The miner's existing balance of this token, if any, merged into the new cell. */
  held: TokenCell | null;
  nonce: bigint;
  /** The standard reward for this nonce at the ticket's anchor (`reward()` in `standard.ts`). */
  reward: bigint;
}

/**
 * Mint: pays only the network. The next ticket is a separate transaction: the
 * script refuses a mint that re-arms, so a transaction carrying a balance
 * never depends on when it confirms.
 *
 * With a token cell already held, the miner cell returns to idle at output 1
 * carrying the nonce, and the balance grows by the reward in the token cell at
 * output 2. Without one, the miner cell's capacity becomes the token cell, at
 * output 1: the paymaster's one cell cannot hold both, and the next round
 * pays for a new miner cell instead. The nonce then travels in the btc.fun
 * witness.
 */
export function planMint(config: RgbppConfig, terms: LaunchTerms, request: MintRequest): Plan {
  const { miner, held, nonce, reward } = request;
  if (miner.data.state !== "armed") throw new Error("a mint needs an armed miner cell");
  if (reward <= 0n) throw new RangeError("a mint must mint something");
  const mint = mintScript(config, terms);
  const token = tokenScript(config, mint);

  if (held === null) {
    const capacity = miner.capacity - CKB_FEE;
    const needed = occupied({ lock: pendingLock(config, TICKET_VOUT), type: token }, encodeAmount(reward));
    if (capacity < needed) throw new Error("this miner cell is too small to become the token cell");
    return finish(config, {
      virtualTx: {
        inputs: [miner.outPoint],
        outputs: [{ capacity, lock: pendingLock(config, TICKET_VOUT), type: token }],
        outputsData: [encodeAmount(reward)],
      },
      btcOutputs: [{ kind: "seal", value: SEAL_SATS }],
      sealsSpent: [miner.seal],
      needPaymasterCell: false,
      sumInputsCapacity: miner.capacity,
      btcfunWitness: ccc.hexFrom(ccc.numLeToBytes(nonce, 8)),
    });
  }

  return finish(config, {
    virtualTx: {
      inputs: [miner.outPoint, held.outPoint],
      outputs: [
        { capacity: miner.capacity - CKB_FEE, lock: pendingLock(config, 1), type: mint },
        { capacity: held.capacity, lock: pendingLock(config, 2), type: token },
      ],
      outputsData: [encodeMinerCell({ state: "idle", nonce, anchor: miner.data.anchor }), encodeAmount(held.amount + reward)],
    },
    btcOutputs: [
      { kind: "seal", value: SEAL_SATS },
      { kind: "seal", value: SEAL_SATS },
    ],
    sealsSpent: [miner.seal, held.seal],
    needPaymasterCell: false,
    sumInputsCapacity: miner.capacity + held.capacity,
  });
}

export interface TransferRequest {
  from: TokenCell[];
  amount: bigint;
  /** The recipient's Bitcoin address: their tokens are sealed to the output that pays it. */
  to: string;
  paymaster: Paymaster;
}

/**
 * Transfer: the recipient's tokens sealed to output 1, which pays their
 * address; the sender's change sealed to output 2. A new recipient cell needs
 * capacity the sender's cells do not have, which the paymaster provides.
 */
export function planTransfer(config: RgbppConfig, terms: LaunchTerms, request: TransferRequest): Plan {
  const { from, amount, to, paymaster } = request;
  const total = from.reduce((sum, cell) => sum + cell.amount, 0n);
  if (amount <= 0n) throw new RangeError("a transfer moves a positive amount");
  if (amount > total) throw new RangeError("the transfer exceeds the balance");
  const token = tokenScript(config, mintScript(config, terms));
  const capacity = from.reduce((sum, cell) => sum + cell.capacity, 0n);
  const cellCapacity = tokenCellCapacity(config, terms);
  const change = total - amount;

  const outputs: ccc.CellOutputLike[] = [{ capacity: cellCapacity, lock: pendingLock(config, 1), type: token }];
  const outputsData: ccc.Hex[] = [encodeAmount(amount)];
  const btcOutputs: PlannedOutput[] = [{ kind: "payment", address: to, value: SEAL_SATS }];
  if (change > 0n) {
    outputs.push({ capacity: cellCapacity, lock: pendingLock(config, 2), type: token });
    outputsData.push(encodeAmount(change));
    btcOutputs.push({ kind: "seal", value: SEAL_SATS });
  }
  const needed = BigInt(outputs.length) * cellCapacity;
  const needPaymasterCell = needed > capacity;
  if (needPaymasterCell) {
    btcOutputs.push({ kind: "paymaster", address: paymaster.address, value: paymaster.feeSats });
  } else {
    // Enough capacity already: the recipient's cell absorbs what is left over,
    // less the fee, so none of it is stranded.
    outputs[0] = { ...outputs[0], capacity: capacity - needed + cellCapacity - CKB_FEE };
  }

  return finish(config, {
    virtualTx: { inputs: from.map((cell) => cell.outPoint), outputs, outputsData },
    btcOutputs,
    sealsSpent: from.map((cell) => cell.seal),
    needPaymasterCell,
    sumInputsCapacity: capacity,
  });
}
