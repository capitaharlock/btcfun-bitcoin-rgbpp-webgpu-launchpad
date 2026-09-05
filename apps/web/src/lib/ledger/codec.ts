/* Canonical encoding and digest for ledger records.
 *
 * A signature is only as good as the bytes it covers, so the encoding is
 * explicit rather than `JSON.stringify`: key order, number formatting and
 * optional-field handling are all implementation-defined in JSON, and two
 * encoders that disagree turn a valid signature into an invalid one.
 *
 * Every field is length-prefixed and tagged. Two different field sets therefore
 * cannot serialise to the same bytes — the same discipline `lib/challenge.ts`
 * applies to the mining challenge, and for the same reason.
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes } from "../bytes";
import { GENESIS_PREV, type LedgerBody, type SignedRecord } from "./types";

const encoder = new TextEncoder();

/** `<2-byte length><label>:<value>` — the one encoding rule in this file. */
function field(label: string, value: string): Uint8Array {
  const payload = encoder.encode(`${label}:${value}`);
  const header = new Uint8Array(2);
  header[0] = (payload.length >> 8) & 0xff;
  header[1] = payload.length & 0xff;
  return concatBytes(header, payload);
}

/**
 * Canonical bytes for a record body.
 *
 * The envelope comes first in a fixed order, then kind-specific fields. An
 * absent optional field is encoded as the empty string rather than omitted, so
 * a record with `memo: ""` and one with no memo at all cannot both be signed
 * under the same digest while rendering differently.
 */
export function encodeRecord(body: LedgerBody): Uint8Array {
  const parts: Uint8Array[] = [
    field("v", "btcfun/ledger/1"),
    field("seq", String(body.seq)),
    field("prev", body.prev),
    field("launch", body.launch),
    field("author", body.author),
    field("at", body.at),
    field("kind", body.kind),
  ];

  if (body.kind === "claim") {
    parts.push(
      field("epoch", String(body.epoch)),
      field("btcBlockHash", body.btcBlockHash),
      field("nonce", body.nonce),
      field("clz", String(body.clz)),
      field("amount", body.amount),
      field("ticket", body.ticket),
      field("ticketSats", String(body.ticketSats)),
    );
  } else {
    parts.push(
      field("to", body.to),
      field("amount", body.amount),
      field("memo", body.memo ?? ""),
    );
  }

  return concatBytes(...parts);
}

/**
 * The 32-byte digest that is signed and that chains records together.
 *
 * Double SHA-256, as Bitcoin does, so the same digest construction covers a
 * ledger record and a transaction and there is one hashing convention in the
 * codebase rather than two.
 */
export function recordDigest(body: LedgerBody): Uint8Array {
  return sha256(sha256(encodeRecord(body)));
}

export function recordId(body: LedgerBody): string {
  return bytesToHex(recordDigest(body));
}

/** Digest of the chain head, for the `prev` of the next record. */
export function headOf(records: readonly SignedRecord[]): string {
  const last = records.at(-1);
  return last ? recordId(last.body) : GENESIS_PREV;
}

/** Parse a decimal atom string, rejecting anything that is not one. */
export function parseAtoms(value: string, label = "amount"): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new RangeError(`${label} must be a non-negative decimal integer, got "${value}"`);
  }
  return BigInt(value);
}
