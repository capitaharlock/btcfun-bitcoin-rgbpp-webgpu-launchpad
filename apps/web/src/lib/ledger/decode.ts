/* Turning untrusted JSON into a record, or refusing to.
 *
 * TypeScript types describe what the code believes; they check nothing at the
 * boundary where a chain arrives from localStorage, a pasted export or another
 * person. Casting there is how a record with `kind: "not-a-transfer"` reached
 * `replay`, matched neither branch of an `if claim / else transfer`, and moved
 * tokens as a transfer nobody had written the rules for.
 *
 * So the decoder is exhaustive in both directions. Every kind is named and
 * anything else is refused, and every field of the kind that *is* named must be
 * present, well-typed and in range — with no extra keys, because the canonical
 * encoder only covers the fields it knows about, and an unknown key would ride
 * along inside a valid signature without ever having been signed over.
 *
 * This runs before the signature check rather than after. A malformed record is
 * not worth a curve operation, and a decoder that trusts anything the signature
 * covered has the order backwards: the signature proves who wrote the bytes,
 * never that the bytes mean something.
 */

import { IDENTITY_PATTERN, TXID_PATTERN } from "../canonical";
import { NONCE_LIMIT } from "../mining/verify";
import {
  LedgerError,
  MAX_MEMO_CHARS,
  type ClaimRecord,
  type LedgerBody,
  type RecordKind,
  type SignedRecord,
  type TransferRecord,
} from "./types";

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

/** Longest a launch id may be. Matches the index's own bound. */
const MAX_LAUNCH_CHARS = 64;
/** Longest an ISO timestamp may be. Display only, but still bounded. */
const MAX_AT_CHARS = 40;
/** SHA-256 has 256 bits, so no candidate can claim more leading zeros. */
const MAX_CLZ = 256;

/** Keys a record body may carry, per kind. Anything else is unsigned payload. */
const ENVELOPE_KEYS = ["kind", "seq", "prev", "at", "launch", "author"] as const;
const CLAIM_KEYS = [
  ...ENVELOPE_KEYS,
  "epoch",
  "btcBlockHash",
  "nonce",
  "clz",
  "amount",
  "ticket",
  "ticketSats",
] as const;
const TRANSFER_KEYS = [...ENVELOPE_KEYS, "to", "amount", "memo"] as const;

/** A decode failure, positioned when the record's place in a chain is known. */
function fault(where: string, why: string, index?: number): LedgerError {
  return new LedgerError(
    index === undefined ? `${where} ${why}` : `Record ${index} ${why}`,
    index,
  );
}

type Raw = Record<string, unknown>;

function asObject(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Raw)
    : null;
}

/**
 * Decode one signed record. Throws `LedgerError` naming the first problem.
 *
 * `index` is the record's position when decoding a chain, so the message reads
 * the same as every other validation failure and a UI can point at the row.
 */
export function decodeRecord(value: unknown, index?: number): SignedRecord {
  const outer = asObject(value);
  if (!outer) throw fault("Record", "is not an object", index);

  const { signature } = outer;
  if (typeof signature !== "string" || !HEX128.test(signature)) {
    throw fault("Record", "has a malformed signature", index);
  }

  const raw = asObject(outer.body);
  if (!raw) throw fault("Record", "has no body object", index);
  if (Object.keys(outer).length !== 2) {
    throw fault("Record", "carries fields outside body and signature", index);
  }

  return { body: decodeBody(raw, index), signature };
}

/** Decode a whole chain, oldest first. */
export function decodeChain(value: unknown): SignedRecord[] {
  if (!Array.isArray(value)) throw new LedgerError("That chain is not an array of records.");
  return value.map((record, index) => decodeRecord(record, index));
}

/**
 * One decoder per kind, and the `satisfies` makes that exhaustive at compile
 * time: adding a kind to `LedgerBody` without a decoder here fails the build
 * rather than falling through to whichever branch happened to be last.
 */
const DECODERS = {
  claim: decodeClaim,
  transfer: decodeTransfer,
} satisfies Record<RecordKind, (raw: Raw, index?: number) => LedgerBody>;

function decodeBody(raw: Raw, index?: number): LedgerBody {
  const kind = raw.kind;
  if (typeof kind !== "string" || !Object.hasOwn(DECODERS, kind)) {
    throw fault("Record", `has unknown kind ${JSON.stringify(kind)}`, index);
  }
  return DECODERS[kind as RecordKind](raw, index);
}

/** Envelope fields, shared by every kind. */
function decodeEnvelope(raw: Raw, index?: number) {
  const seq = raw.seq;
  if (!Number.isInteger(seq) || (seq as number) < 0) {
    throw fault("Record", "has a malformed sequence number", index);
  }
  if (typeof raw.prev !== "string" || !HEX64.test(raw.prev)) {
    throw fault("Record", "has a malformed previous digest", index);
  }
  if (typeof raw.at !== "string" || raw.at.length === 0 || raw.at.length > MAX_AT_CHARS) {
    throw fault("Record", "has a malformed timestamp", index);
  }
  if (
    typeof raw.launch !== "string" ||
    raw.launch.length === 0 ||
    raw.launch.length > MAX_LAUNCH_CHARS
  ) {
    throw fault("Record", "has a malformed launch id", index);
  }
  if (typeof raw.author !== "string" || !IDENTITY_PATTERN.test(raw.author)) {
    throw fault("Record", "has a malformed author key", index);
  }
  return { seq: seq as number, prev: raw.prev, at: raw.at, launch: raw.launch, author: raw.author };
}

function decodeClaim(raw: Raw, index?: number): ClaimRecord {
  rejectExtraKeys(raw, CLAIM_KEYS, index);
  const envelope = decodeEnvelope(raw, index);

  if (!Number.isInteger(raw.epoch) || (raw.epoch as number) < 0) {
    throw fault("Record", "has a malformed epoch", index);
  }
  if (typeof raw.btcBlockHash !== "string" || !HEX64.test(raw.btcBlockHash)) {
    throw fault("Record", "has a malformed block hash", index);
  }
  if (typeof raw.ticket !== "string" || !TXID_PATTERN.test(raw.ticket)) {
    throw fault("Record", "has a malformed ticket txid", index);
  }
  if (typeof raw.nonce !== "string" || !DECIMAL.test(raw.nonce)) {
    throw fault("Record", "has a malformed nonce", index);
  }
  // A nonce is a 64-bit field. Outside that range it has no single canonical
  // decimal form, so two records could prove the same work (AUD-14).
  if (BigInt(raw.nonce) >= NONCE_LIMIT) {
    throw fault("Record", "has a nonce outside the 64-bit field", index);
  }
  if (!Number.isInteger(raw.clz) || (raw.clz as number) < 0 || (raw.clz as number) > MAX_CLZ) {
    throw fault("Record", "has a malformed leading-zero count", index);
  }
  if (typeof raw.amount !== "string" || !DECIMAL.test(raw.amount)) {
    throw fault("Record", "has a malformed amount", index);
  }
  if (!Number.isInteger(raw.ticketSats) || (raw.ticketSats as number) < 0) {
    throw fault("Record", "has a malformed ticket price", index);
  }

  return {
    kind: "claim",
    ...envelope,
    epoch: raw.epoch as number,
    btcBlockHash: raw.btcBlockHash,
    nonce: raw.nonce,
    clz: raw.clz as number,
    amount: raw.amount,
    ticket: raw.ticket,
    ticketSats: raw.ticketSats as number,
  };
}

function decodeTransfer(raw: Raw, index?: number): TransferRecord {
  rejectExtraKeys(raw, TRANSFER_KEYS, index);
  const envelope = decodeEnvelope(raw, index);

  if (typeof raw.to !== "string" || !IDENTITY_PATTERN.test(raw.to)) {
    throw fault("Record", "has a malformed recipient key", index);
  }
  if (typeof raw.amount !== "string" || !DECIMAL.test(raw.amount)) {
    throw fault("Record", "has a malformed amount", index);
  }
  if (raw.memo !== undefined) {
    if (typeof raw.memo !== "string" || raw.memo.length > MAX_MEMO_CHARS) {
      throw fault("Record", "has a malformed memo", index);
    }
  }

  return {
    kind: "transfer",
    ...envelope,
    to: raw.to,
    amount: raw.amount,
    ...(raw.memo !== undefined ? { memo: raw.memo } : {}),
  };
}

function rejectExtraKeys(raw: Raw, allowed: readonly string[], index?: number): void {
  const extra = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    throw fault("Record", `carries unsigned fields: ${extra.join(", ")}`, index);
  }
}
