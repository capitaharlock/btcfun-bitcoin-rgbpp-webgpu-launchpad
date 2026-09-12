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

import { TICKET_SATS } from "../standard";
import { commitment, type VirtualTx } from "./commitment";
import type { RgbppConfig } from "./config";
import { mintScript, tokenScript, type LaunchTerms } from "./launch";
import { pendingLock, type Seal } from "./seal";

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

export type MinerStateName = "idle" | "armed";

/** A miner cell's data, as `contracts/mint-core` `MinerCell` lays it out. */
export interface MinerCellData {
  state: MinerStateName;
  /** The nonce of the last mint. */
  nonce: bigint;
  /** The height the current ticket's reward is priced at. */
  anchor: number;
}

export function encodeMinerCell(cell: MinerCellData): ccc.Hex {
  return ccc.hexFrom(
    ccc.bytesConcat([cell.state === "armed" ? 1 : 0], ccc.numLeToBytes(cell.nonce, 8), ccc.numLeToBytes(cell.anchor, 4)),
  );
}

export function decodeMinerCell(data: ccc.HexLike): MinerCellData | null {
  const bytes = ccc.bytesFrom(data);
  if (bytes.length !== 13 || bytes[0] > 1) return null;
  return {
    state: bytes[0] === 1 ? "armed" : "idle",
    nonce: ccc.numLeFromBytes(bytes.slice(1, 9)),
    anchor: Number(ccc.numLeFromBytes(bytes.slice(9))),
  };
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

/** Capacity a miner cell is opened with: what it occupies, plus its fee reserve. */
export function minerCellCapacity(config: RgbppConfig, terms: LaunchTerms): bigint {
  const lock = pendingLock(config, 1);
  const data = encodeMinerCell({ state: "idle", nonce: 0n, anchor: 0 });
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
  return { ...parts, cellDeps: deps(config), commitment: commitment(parts.virtualTx) };
}

/**
 * Open: an idle miner cell sealed to output 1 of the opening Bitcoin
 * transaction. It has no inputs; the paymaster provides the capacity for a fee
 * in the same Bitcoin transaction, so a person holding only Bitcoin can open one.
 */
export function planOpen(config: RgbppConfig, terms: LaunchTerms, paymaster: Paymaster): Plan {
  return finish(config, {
    virtualTx: {
      inputs: [],
      outputs: [
        {
          capacity: minerCellCapacity(config, terms),
          lock: pendingLock(config, 1),
          type: mintScript(config, terms),
        },
      ],
      outputsData: [encodeMinerCell({ state: "idle", nonce: 0n, anchor: 0 })],
    },
    btcOutputs: [
      { kind: "seal", value: SEAL_SATS },
      { kind: "paymaster", address: paymaster.address, value: paymaster.feeSats },
    ],
    sealsSpent: [],
    needPaymasterCell: true,
    sumInputsCapacity: 0n,
  });
}

/**
 * Ticket: pay the promoter, and the miner cell moves to output 1 armed,
 * anchored at `tip` — the height its reward will be priced at. The script
 * accepts an anchor up to a day behind the block that confirms the ticket, so
 * the tip at signing time is right; if the ticket sat unconfirmed for longer,
 * only this empty miner cell would be lost.
 */
export function planTicket(config: RgbppConfig, terms: LaunchTerms, miner: MinerCell, tip: number): Plan {
  if (miner.data.state !== "idle") throw new Error("this miner cell already holds a ticket");
  if (tip < terms.h0) throw new RangeError("the launch has not opened yet");
  return finish(config, {
    virtualTx: {
      inputs: [miner.outPoint],
      outputs: [
        { capacity: miner.capacity - CKB_FEE, lock: pendingLock(config, 1), type: mintScript(config, terms) },
      ],
      outputsData: [encodeMinerCell({ state: "armed", nonce: miner.data.nonce, anchor: tip })],
    },
    btcOutputs: [
      { kind: "seal", value: SEAL_SATS },
      { kind: "ticket", script: terms.promoterScript, value: TICKET_SATS },
    ],
    sealsSpent: [miner.seal],
    needPaymasterCell: false,
    sumInputsCapacity: miner.capacity,
  });
}

export interface MintRequest {
  miner: MinerCell;
  /** The miner's existing balance of this token, if any, merged into the new cell. */
  held: TokenCell | null;
  nonce: bigint;
  /** The standard reward for this nonce at the ticket's anchor (`reward()` in `standard.ts`). */
  reward: bigint;
  /** Needed only when there is no token cell yet to carry the balance. */
  paymaster: Paymaster | null;
}

/**
 * Mint: the miner cell returns to idle at output 1 carrying the nonce, and the
 * balance grows by the reward in a token cell at output 2. The next ticket is
 * a separate transaction: the script refuses a mint that re-arms, so that a
 * transaction carrying a balance never depends on when it confirms.
 */
export function planMint(config: RgbppConfig, terms: LaunchTerms, request: MintRequest): Plan {
  const { miner, held, nonce, reward, paymaster } = request;
  if (miner.data.state !== "armed") throw new Error("a mint needs an armed miner cell");
  if (reward <= 0n) throw new RangeError("a mint must mint something");
  const mint = mintScript(config, terms);
  const token = tokenScript(config, mint);

  const needPaymasterCell = held === null;
  if (needPaymasterCell && !paymaster) {
    throw new Error("a first mint needs the paymaster to provide the token cell's capacity");
  }

  const inputs = held ? [miner.outPoint, held.outPoint] : [miner.outPoint];
  const btcOutputs: PlannedOutput[] = [
    { kind: "seal", value: SEAL_SATS },
    { kind: "seal", value: SEAL_SATS },
  ];
  if (needPaymasterCell) {
    btcOutputs.push({ kind: "paymaster", address: paymaster!.address, value: paymaster!.feeSats });
  }

  return finish(config, {
    virtualTx: {
      inputs,
      outputs: [
        { capacity: miner.capacity - CKB_FEE, lock: pendingLock(config, 1), type: mint },
        {
          capacity: held ? held.capacity : tokenCellCapacity(config, terms),
          lock: pendingLock(config, 2),
          type: token,
        },
      ],
      outputsData: [
        encodeMinerCell({ state: "idle", nonce, anchor: miner.data.anchor }),
        encodeAmount((held?.amount ?? 0n) + reward),
      ],
    },
    btcOutputs,
    sealsSpent: held ? [miner.seal, held.seal] : [miner.seal],
    needPaymasterCell,
    sumInputsCapacity: miner.capacity + (held?.capacity ?? 0n),
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
