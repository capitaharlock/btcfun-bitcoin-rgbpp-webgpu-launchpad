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
import { parseAtoms, recordDigest, recordId } from "./codec";
import {
  GENESIS_PREV,
  LedgerError,
  type ClaimRecord,
  type LedgerState,
  type SignedRecord,
} from "./types";

/** Everything replay needs to know about a launch, beyond its records. */
export interface LaunchRules {
  launch: string;
  /** Protocol version tag bound into every challenge. */
  version: string;
  /** Network tag bound into every challenge. */
  network: string;
  schedule: Schedule;
  /** Blocks per epoch. With `h0`, fixes which budget an epoch may mint. */
  epochBlocks: number;
  /** Bitcoin height the launch opened at. */
  h0: number;
  /** Leading zero bits a candidate must reach to be admitted. */
  minClz: number;
  /** Price of one ticket, in satoshis. */
  ticketSats: number;
}

const PUBKEY = /^0[23][0-9a-f]{64}$/;
const TXID = /^[0-9a-f]{64}$/;

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
 */
export function replay(records: readonly SignedRecord[], rules: LaunchRules): LedgerState {
  const acc: Accumulator = {
    balances: new Map(),
    supply: 0n,
    reserveSats: 0,
    spentTickets: new Set(),
    mintedByEpoch: new Map(),
    head: GENESIS_PREV,
  };
  const ceiling = maxAtoms(rules.schedule);

  records.forEach((record, index) => {
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
    if (!PUBKEY.test(body.author)) {
      throw new LedgerError(`Record ${index} has a malformed author key`, index);
    }

    const digest = recordDigest(body);
    if (!verifyDigest(hexToBytes(body.author), digest, hexToBytes(signature))) {
      throw new LedgerError(`Record ${index} is not signed by its stated author`, index);
    }

    if (body.kind === "claim") {
      applyClaim(acc, body, rules, ceiling, index);
    } else {
      const amount = parseAtoms(body.amount);
      if (amount <= 0n) throw new LedgerError(`Record ${index} transfers nothing`, index);
      if (!PUBKEY.test(body.to)) {
        throw new LedgerError(`Record ${index} has a malformed recipient key`, index);
      }
      if (body.to === body.author) {
        throw new LedgerError(`Record ${index} transfers to its own author`, index);
      }
      if ((body.memo?.length ?? 0) > 120) {
        throw new LedgerError(`Record ${index} has an over-long memo`, index);
      }
      const held = acc.balances.get(body.author) ?? 0n;
      if (held < amount) {
        throw new LedgerError(
          `Record ${index} spends ${amount} atoms against a balance of ${held}`,
          index,
        );
      }
      acc.balances.set(body.author, held - amount);
      acc.balances.set(body.to, (acc.balances.get(body.to) ?? 0n) + amount);
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

function applyClaim(
  acc: Accumulator,
  claim: ClaimRecord,
  rules: LaunchRules,
  ceiling: bigint,
  index: number,
): void {
  if (!Number.isInteger(claim.epoch) || claim.epoch < 0) {
    throw new LedgerError(`Record ${index} has an invalid epoch`, index);
  }
  if (!TXID.test(claim.ticket)) {
    throw new LedgerError(`Record ${index} has a malformed ticket txid`, index);
  }
  if (!TXID.test(claim.btcBlockHash)) {
    throw new LedgerError(`Record ${index} has a malformed block hash`, index);
  }
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
