/* Canonical encoding and digest for ledger records.
 *
 * The encoding rules live in `lib/canonical.ts`; this file only decides which
 * fields a record commits to and in what order. Keeping those two apart is
 * what lets market offers be signed under the same discipline without a second
 * copy of the encoder.
 */

import { canonicalDigest, canonicalId, encodeFields, type Field } from "../canonical";
import { GENESIS_PREV, type LedgerBody, type SignedRecord } from "./types";

/** Fields a record commits to: envelope first, then kind-specific. */
function fieldsOf(body: LedgerBody): Field[] {
  const fields: Field[] = [
    ["v", "btcfun/ledger/1"],
    ["seq", String(body.seq)],
    ["prev", body.prev],
    ["launch", body.launch],
    ["author", body.author],
    ["at", body.at],
    ["kind", body.kind],
  ];

  if (body.kind === "claim") {
    fields.push(
      ["epoch", String(body.epoch)],
      ["btcBlockHash", body.btcBlockHash],
      ["nonce", body.nonce],
      ["clz", String(body.clz)],
      ["amount", body.amount],
      ["ticket", body.ticket],
      ["ticketSats", String(body.ticketSats)],
    );
  } else {
    fields.push(["to", body.to], ["amount", body.amount], ["memo", body.memo ?? ""]);
  }

  return fields;
}

export function encodeRecord(body: LedgerBody): Uint8Array {
  return encodeFields(fieldsOf(body));
}

/** The 32-byte digest that is signed and that chains records together. */
export function recordDigest(body: LedgerBody): Uint8Array {
  return canonicalDigest(fieldsOf(body));
}

export function recordId(body: LedgerBody): string {
  return canonicalId(fieldsOf(body));
}

/** Digest of the chain head, for the `prev` of the next record. */
export function headOf(records: readonly SignedRecord[]): string {
  const last = records.at(-1);
  return last ? recordId(last.body) : GENESIS_PREV;
}

export { parseAtoms } from "../canonical";
