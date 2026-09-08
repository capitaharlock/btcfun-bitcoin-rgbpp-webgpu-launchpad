/* Ledger rules: allocation, and replay-from-genesis validation.
 *
 * These are the protocol, expressed as code that anyone can run over a chain
 * they were handed. No storage, no network, no UI — just records in, validated
 * state out — which is what makes the whole thing testable and what makes the
 * Proof Explorer's "verify this ledger" button mean something.
 *
 * `replay` is deliberately the *only* way state is produced. `append` runs it
 * too. A separate incremental path would be faster and would eventually diverge
 * from the checked one, and a divergence there is a minting bug.
 */

import { budget as epochBudgetOf, maxAtoms, type Schedule } from "../emission";
import { challengeDigest } from "../challenge";
import { recompute } from "../mining";
import { verifyDigest } from "../bitcoin";
import { bytesToHex, hexToBytes } from "../bytes";
import { recordDigest, recordId } from "./codec";
import { decodeRecord } from "./decode";
import { parseAtoms } from "../canonical";
import {
  GENESIS_PREV,
  LedgerError,
  type ClaimRecord,
  type LedgerState,
  type SignedRecord,
  type TransferRecord,
} from "./types";

/** Everything replay needs to know about a launch, beyond its records. */
export interface LaunchRules {
  launch: string;
  /** Protocol version tag bound into every challenge. */
  version: string;
  /** Network tag bound into every challenge. */
  network: string;
  schedule: Schedule;
  /**
   * Blocks per epoch. Fixes which slice of the schedule an epoch may mint.
   *
   * Note what is absent: the launch's opening height. A record names its epoch
   * by index, so validation never needs to know when the launch opened — which
   * is what keeps a stored chain valid as the chain tip advances.
   */
  epochBlocks: number;
  /** Leading zero bits a candidate must reach to be admitted. */
  minClz: number;
  /** Price of one ticket, in satoshis. */
  ticketSats: number;
}

// ── allocation ───────────────────────────────────────────────────────────────

export interface Allocation {
  /** Atoms the claim may mint. */
  amount: bigint;
  /** Which limit bound it — useful in the UI and in tests. */
  boundBy: "budget" | "backing" | "bootstrap";
}

/**
 * How many atoms one admitted claim mints.
 *
 * This implements the PROTOCOL.md §4.3 *candidate* — backing-limited issuance —
 * for the single-participant case, which is what a local chain is. The cap
 * `floor(ΔR × S / R)` is exactly the rule that keeps the redemption ratio `R/S`
 * from falling: minting at most that much means the new backing per token is at
 * least the old one. The emission lab reproduces what happens without it.
 *
 * The rule is a candidate, not adopted economics. `E1`–`E5` have not passed.
 *
 * Bootstrap: with no supply yet there is no ratio to preserve, so the first
 * claim takes the epoch budget and establishes `R/S` for everyone after it.
 */
export function allocate(
  epochBudget: bigint,
  supply: bigint,
  reserveSats: number,
  ticketSats: number,
): Allocation {
  if (epochBudget <= 0n) return { amount: 0n, boundBy: "budget" };
  if (supply === 0n || reserveSats === 0) {
    return { amount: epochBudget, boundBy: "bootstrap" };
  }
  const cap = (BigInt(ticketSats) * supply) / BigInt(reserveSats);
  return cap < epochBudget
    ? { amount: cap, boundBy: "backing" }
    : { amount: epochBudget, boundBy: "budget" };
}

/** The schedule's budget for one epoch, in atoms. */
export function epochBudget(rules: LaunchRules, epoch: number): bigint {
  const blocks = BigInt(rules.epochBlocks);
  return epochBudgetOf(rules.schedule, BigInt(epoch) * blocks, BigInt(epoch + 1) * blocks);
}

/** Challenge digest a claim is bound to. Derived, never taken from the record. */
export function claimChallenge(rules: LaunchRules, claim: ClaimRecord): Uint8Array {
  return challengeDigest({
    version: rules.version,
    network: rules.network,
    launch: rules.launch,
    epoch: claim.epoch,
    btcBlockHash: claim.btcBlockHash,
    ticket: claim.ticket,
    owner: claim.author,
  });
}

// ── replay ───────────────────────────────────────────────────────────────────

/** Mutable accumulator; the public `LedgerState` is built from it at the end. */
interface Accumulator {
  balances: Map<string, bigint>;
  supply: bigint;
  reserveSats: number;
  spentTickets: Set<string>;
  /** Atoms already minted per epoch, so an epoch cannot overspend its budget. */
  mintedByEpoch: Map<number, bigint>;
  head: string;
}

/**
 * Validate a chain from genesis and return the state it implies.
 *
 * Throws `LedgerError` naming the first offending record. Partial validation is
 * not offered: a chain with one bad record has no defensible state, and
 * returning "the valid prefix" would invite showing a balance derived from it.
 *
 * WHAT THIS CHECKS. Structure, authorship, arithmetic and work: sequence and
 * chaining, a signature by the stated author, a nonce that really produces the
 * stated leading zeros against a challenge derived from the record's own
 * fields, no reused ticket, and an amount equal to what the allocation rule
 * computes from the state so far.
 *
 * WHAT THIS DOES NOT CHECK, and it is a large gap. The ticket txid, the
 * satoshis it paid and the block hash the epoch opened on are all taken from
 * the record itself. Nothing here talks to Bitcoin, so a chain can be perfectly
 * self-consistent while naming a payment that was never made, a block that does
 * not exist, or an epoch the launch had not yet reached. `LaunchRules` has no
 * opening height, so replay cannot even bound which epochs are plausible.
 * That is deliberate for a stored chain — it must stay valid as the
 * tip advances — and it is also the reason this layer is not settlement: PoW
 * here proves effort, not admission. Closing it means SPV evidence or a
 * consensus layer, which is what PROTOCOL.md §2 withdrew and task V3 owns. The
 * Proof Explorer states the same thing per record.
 */
export function replay(records: readonly SignedRecord[], rules: LaunchRules): LedgerState {
  // Decode first, from `unknown`: `records` is typed but nothing checked it —
  // it came from localStorage, an import or the index. `decodeRecord` is what
  // makes the switch below exhaustive over kinds that actually exist.
  const decoded = records.map((record, index) => decodeRecord(record, index));

  const acc: Accumulator = {
    balances: new Map(),
    supply: 0n,
    reserveSats: 0,
    spentTickets: new Set(),
    mintedByEpoch: new Map(),
    head: GENESIS_PREV,
  };
  const ceiling = maxAtoms(rules.schedule);

  decoded.forEach((record, index) => {
    const { body, signature } = record;

    if (body.seq !== index) {
      throw new LedgerError(`Record ${index} claims sequence ${body.seq}`, index);
    }
    if (body.prev !== acc.head) {
      throw new LedgerError(`Record ${index} does not chain to the previous record`, index);
    }
    if (body.launch !== rules.launch) {
      throw new LedgerError(`Record ${index} belongs to launch "${body.launch}"`, index);
    }

    const digest = recordDigest(body);
    if (!verifyDigest(hexToBytes(body.author), digest, hexToBytes(signature))) {
      throw new LedgerError(`Record ${index} is not signed by its stated author`, index);
    }

    // Shape is already guaranteed by the decoder; what is left here is meaning.
    switch (body.kind) {
      case "claim":
        applyClaim(acc, body, rules, ceiling, index);
        break;
      case "transfer":
        applyTransfer(acc, body, index);
        break;
      default:
        // Unreachable: `decodeRecord` refuses anything else. Present so adding
        // a kind fails the build here as well as in the decoder.
        throw new LedgerError(`Record ${index} has an unhandled kind`, index);
    }

    acc.head = bytesToHex(digest);
  });

  return {
    launch: rules.launch,
    balances: acc.balances,
    supply: acc.supply,
    reserveSats: acc.reserveSats,
    head: acc.head,
    length: records.length,
    spentTickets: acc.spentTickets,
  };
}

function applyTransfer(acc: Accumulator, transfer: TransferRecord, index: number): void {
  const amount = parseAtoms(transfer.amount);
  if (amount <= 0n) throw new LedgerError(`Record ${index} transfers nothing`, index);
  if (transfer.to === transfer.author) {
    throw new LedgerError(`Record ${index} transfers to its own author`, index);
  }

  const held = acc.balances.get(transfer.author) ?? 0n;
  if (held < amount) {
    throw new LedgerError(
      `Record ${index} spends ${amount} atoms against a balance of ${held}`,
      index,
    );
  }
  acc.balances.set(transfer.author, held - amount);
  acc.balances.set(transfer.to, (acc.balances.get(transfer.to) ?? 0n) + amount);
}

function applyClaim(
  acc: Accumulator,
  claim: ClaimRecord,
  rules: LaunchRules,
  ceiling: bigint,
  index: number,
): void {
  // Shape — epoch, txid and block hash formats — was settled by the decoder.
  if (acc.spentTickets.has(claim.ticket)) {
    throw new LedgerError(`Record ${index} reuses ticket ${claim.ticket}`, index);
  }
  if (claim.ticketSats < rules.ticketSats) {
    throw new LedgerError(
      `Record ${index} paid ${claim.ticketSats} sats for a ${rules.ticketSats} sat ticket`,
      index,
    );
  }

  // The work must actually have been done, against the challenge these very
  // fields derive. This is the check that makes the claim proof of work rather
  // than an assertion, and it is why the challenge is not a stored field.
  const candidate = recompute(claimChallenge(rules, claim), parseAtoms(claim.nonce, "nonce"));
  if (candidate.clz !== claim.clz) {
    throw new LedgerError(
      `Record ${index} claims ${claim.clz} zero bits; its nonce yields ${candidate.clz}`,
      index,
    );
  }
  if (candidate.clz < rules.minClz) {
    throw new LedgerError(
      `Record ${index} has ${candidate.clz} zero bits, below the ${rules.minClz} required`,
      index,
    );
  }

  const alreadyMinted = acc.mintedByEpoch.get(claim.epoch) ?? 0n;
  const remaining = epochBudget(rules, claim.epoch) - alreadyMinted;
  const expected = allocate(remaining, acc.supply, acc.reserveSats, claim.ticketSats);
  const amount = parseAtoms(claim.amount);

  // A claim that mints nothing still adds its ticket to the reserve, which
  // raises the backing per token for everyone else at the claimant's expense.
  // `signClaim` has always refused to author one; the verifier used to accept
  // it, so author and validator disagreed about what a valid chain is.
  // Until admission and epoch closing are specified — E1–E5 — the
  // rule is that an exhausted epoch admits nothing, on both sides.
  if (expected.amount === 0n) {
    throw new LedgerError(
      `Record ${index} claims an epoch whose allowance is exhausted`,
      index,
    );
  }

  if (amount !== expected.amount) {
    throw new LedgerError(
      `Record ${index} mints ${amount} atoms; the rule allows ${expected.amount}`,
      index,
    );
  }
  if (acc.supply + amount > ceiling) {
    throw new LedgerError(`Record ${index} would exceed the maximum supply`, index);
  }

  acc.spentTickets.add(claim.ticket);
  acc.mintedByEpoch.set(claim.epoch, alreadyMinted + amount);
  acc.supply += amount;
  acc.reserveSats += claim.ticketSats;
  acc.balances.set(claim.author, (acc.balances.get(claim.author) ?? 0n) + amount);
}

/** Record ids in order, so a UI can link a balance back to what produced it. */
export function recordIds(records: readonly SignedRecord[]): string[] {
  return records.map((r) => recordId(r.body));
}
