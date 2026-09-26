/* Canonical encoding for anything that gets signed.
 *
 * A signature is only as good as the bytes it covers, so encoding is explicit
 * rather than `JSON.stringify`: key order, number formatting and optional-field
 * handling are all implementation-defined in JSON, and two encoders that
 * disagree turn a valid signature into an invalid one.
 *
 * Two properties carry the whole design:
 *
 *   Every field is length-prefixed and tagged, so no two different field sets
 *   can serialise to the same bytes. Without that, moving a character from the
 *   end of one field to the start of the next produces an identical encoding
 *   and a signature that covers a different meaning.
 *
 *   An absent optional field is encoded as the empty string, never omitted, so
 *   a record with `memo: ""` and one with no memo cannot share a digest while
 *   rendering differently.
 *
 * `lib/challenge.ts` applies the same discipline with its own implementation,
 * because a mining challenge is hashed with the dependency-free SHA-256 the
 * miner and the GPU kernel both agree on. Here the input is arbitrarily long
 * and never hot, so @noble is the right tool.
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes } from "./bytes";

/** One `(label, value)` pair. Values are always strings by the time they land. */
export type Field = readonly [label: string, value: string];

const encoder = new TextEncoder();

/** `<2-byte big-endian length><label>:<value>`. */
function encodeField([label, value]: Field): Uint8Array {
  const payload = encoder.encode(`${label}:${value}`);
  if (payload.length > 0xffff) {
    throw new RangeError(`canonical field "${label}" exceeds 65535 bytes`);
  }
  const header = new Uint8Array(2);
  header[0] = (payload.length >> 8) & 0xff;
  header[1] = payload.length & 0xff;
  return concatBytes(header, payload);
}

export function encodeFields(fields: readonly Field[]): Uint8Array {
  return concatBytes(...fields.map(encodeField));
}

/**
 * The 32-byte digest that gets signed.
 *
 * Double SHA-256, as Bitcoin does, so one hashing convention covers a ledger
 * record, a market offer and a transaction rather than three.
 */
export function canonicalDigest(fields: readonly Field[]): Uint8Array {
  return sha256(sha256(encodeFields(fields)));
}

export function canonicalId(fields: readonly Field[]): string {
  return bytesToHex(canonicalDigest(fields));
}

/** Parse a decimal integer string, rejecting anything that is not one. */
export function parseAtoms(value: string, label = "amount"): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new RangeError(`${label} must be a non-negative decimal integer, got "${value}"`);
  }
  return BigInt(value);
}

/** A compressed secp256k1 public key in hex — the identity format everywhere. */
export const IDENTITY_PATTERN = /^0[23][0-9a-f]{64}$/;
