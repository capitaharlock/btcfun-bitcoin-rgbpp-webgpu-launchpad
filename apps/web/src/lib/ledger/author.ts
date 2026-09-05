/* Authoring records: fill in the envelope, compute the amount, sign.
 *
 * Callers never choose an amount for a claim. The allocation rule decides it,
 * here, from the same state `replay` will use to check it — so a record is
 * either valid when it is written or it fails immediately rather than becoming
 * an unspendable entry someone has to explain later.
 */

import { bytesToHex } from "../bytes";
import { identityOf, signDigest, type Vault } from "../bitcoin";
import { recordDigest } from "./codec";
import { allocate, epochBudget, replay, type LaunchRules } from "./rules";
import {
  LedgerError,
  type ClaimRecord,
  type Ledger,
  type SignedRecord,
  type TransferRecord,
} from "./types";

/** What the miner brings back from a won epoch. */
export interface ClaimDraft {
  epoch: number;
  /** Hash of the Bitcoin block that opened the epoch. */
  btcBlockHash: string;
  nonce: bigint;
  clz: number;
  /** txid of the broadcast ticket payment. */
  ticket: string;
  /** Satoshis that payment moved to the reserve. */
  ticketSats: number;
}

export interface TransferDraft {
  to: string;
  amount: bigint;
  memo?: string;
}

/** Atoms the next claim in this epoch would mint, for a pre-commit preview. */
export function previewClaim(
  ledger: Ledger,
  rules: LaunchRules,
  epoch: number,
  ticketSats: number,
): bigint {
  const state = ledger.state();
  const minted = mintedInEpoch(ledger, epoch);
  const remaining = epochBudget(rules, epoch) - minted;
  return allocate(remaining, state.supply, state.reserveSats, ticketSats).amount;
}

/** Atoms already minted in one epoch on this chain. */
function mintedInEpoch(ledger: Ledger, epoch: number): bigint {
  let total = 0n;
  for (const record of ledger.records()) {
    if (record.body.kind === "claim" && record.body.epoch === epoch) {
      total += BigInt(record.body.amount);
    }
  }
  return total;
}

export async function signClaim(
  vault: Vault,
  ledger: Ledger,
  rules: LaunchRules,
  draft: ClaimDraft,
): Promise<SignedRecord<ClaimRecord>> {
  if (draft.clz < rules.minClz) {
    throw new LedgerError(
      `This candidate has ${draft.clz} zero bits; ${rules.minClz} are required to claim.`,
    );
  }

  const records = ledger.records();
  const state = replay(records, rules);
  if (state.spentTickets.has(draft.ticket)) {
    throw new LedgerError("That ticket has already been used for a claim.");
  }

  const remaining = epochBudget(rules, draft.epoch) - mintedInEpoch(ledger, draft.epoch);
  const allocation = allocate(remaining, state.supply, state.reserveSats, draft.ticketSats);
  if (allocation.amount <= 0n) {
    throw new LedgerError("This epoch's allowance is exhausted; nothing left to mint.");
  }

  return vault.use((key) => {
    const body: ClaimRecord = {
      kind: "claim",
      seq: records.length,
      prev: state.head,
      at: new Date().toISOString(),
      launch: rules.launch,
      author: identityOf(key),
      epoch: draft.epoch,
      btcBlockHash: draft.btcBlockHash,
      nonce: draft.nonce.toString(),
      clz: draft.clz,
      amount: allocation.amount.toString(),
      ticket: draft.ticket,
      ticketSats: draft.ticketSats,
    };
    return { body, signature: bytesToHex(signDigest(key, recordDigest(body))) };
  });
}

export async function signTransfer(
  vault: Vault,
  ledger: Ledger,
  rules: LaunchRules,
  draft: TransferDraft,
): Promise<SignedRecord<TransferRecord>> {
  if (draft.amount <= 0n) throw new LedgerError("Transfer an amount above zero.");

  const records = ledger.records();
  const state = replay(records, rules);
  const held = state.balances.get(vault.identity) ?? 0n;
  if (held < draft.amount) {
    throw new LedgerError(`You hold ${held} atoms; that transfer needs ${draft.amount}.`);
  }

  return vault.use((key) => {
    const body: TransferRecord = {
      kind: "transfer",
      seq: records.length,
      prev: state.head,
      at: new Date().toISOString(),
      launch: rules.launch,
      author: identityOf(key),
      to: draft.to,
      amount: draft.amount.toString(),
      ...(draft.memo ? { memo: draft.memo } : {}),
    };
    return { body, signature: bytesToHex(signDigest(key, recordDigest(body))) };
  });
}
