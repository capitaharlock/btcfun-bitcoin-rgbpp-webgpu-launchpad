/* A token transfer, planned: one Bitcoin transaction that pays the recipient
 * the output their tokens are sealed to. */

import type { ccc } from "@ckb-ccc/core";

import type { RgbppConfig } from "../config";
import { mintScript, tokenScript, type LaunchTerms } from "../launch";
import { pendingLock } from "../seal";
import { CKB_FEE, tokenCellCapacity } from "../cells/capacity";
import { encodeAmount, type TokenCell } from "../cells/token";
import { finish, SEAL_SATS, type Paymaster, type Plan, type PlannedOutput } from "./plan";

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
