/* Verifying activity events — no wallet, no browser.
 *
 * This half is imported by the Cloudflare Worker that backs the index, so it
 * must depend only on the canonical encoder and the curve. Keeping signing in a
 * separate module is what lets the server run the exact same check as the
 * client rather than a second implementation of it.
 */

import { sha256 } from "@noble/hashes/sha2";

import { canonicalDigest, canonicalId, IDENTITY_PATTERN, type Field } from "../canonical";
import { verifySignature } from "../signatures";
import { bytesToHex, hexToBytes } from "../bytes";
import { ACTIVITY_VERSION, type ActivityBody, type SignedActivity } from "./types";

function fieldsOf(body: ActivityBody): Field[] {
  return [
    ["v", body.v],
    ["kind", body.kind],
    ["launch", body.launch],
    ["actor", body.actor],
    ["amount", body.amount],
    ["sats", String(body.sats)],
    ["ref", body.ref],
    ["txid", body.txid ?? ""],
    ["meta", body.meta ?? ""],
    ["at", body.at],
  ];
}

export function activityDigest(body: ActivityBody): Uint8Array {
  return canonicalDigest(fieldsOf(body));
}

export function activityId(body: ActivityBody): string {
  return canonicalId(fieldsOf(body));
}

/** Largest inline payload, in characters. A launch spec is a few hundred. */
const MAX_META = 1500;

/** Kinds the index accepts. Anything else is rejected rather than stored. */
const KINDS = new Set(["launch", "mint", "offer", "bid", "cancel", "fill", "transfer"]);

/** Kinds whose event is the record itself, so it travels inline. */
const PAYLOAD_KINDS = new Set(["launch", "offer", "bid"]);

/** Why an event is unacceptable, or null when it is well-formed and signed. */
export function faultIn(signed: SignedActivity): string | null {
  const body = signed?.body;
  const signature = signed?.signature;
  if (!body || typeof signature !== "string") return "Not a signed activity event.";
  if (body.v !== ACTIVITY_VERSION) return "Unknown activity version.";
  if (!KINDS.has(body.kind)) return `Unknown activity kind "${body.kind}".`;
  if (typeof body.launch !== "string" || body.launch.length === 0 || body.launch.length > 64) {
    return "Malformed launch id.";
  }
  if (!IDENTITY_PATTERN.test(body.actor ?? "")) return "Malformed actor key.";
  if (!/^[0-9a-f]{64}$/.test(body.ref ?? "")) return "Malformed reference digest.";
  if (body.txid !== undefined && !/^[0-9a-f]{64}$/.test(body.txid)) return "Malformed txid.";
  if (!/^(0|[1-9][0-9]*)$/.test(body.amount ?? "")) return "Malformed amount.";
  if (!Number.isInteger(body.sats) || body.sats < 0) return "Malformed satoshi amount.";
  if (typeof body.at !== "string" || body.at.length > 40) return "Malformed timestamp.";
  if (body.meta !== undefined) {
    if (typeof body.meta !== "string" || body.meta.length > MAX_META) return "Payload too large.";
    // A launch carries its announcement, an offer its listing — whose
    // seller-signed PSBT is what lets a buyer complete the sale alone — and a
    // bid its terms. Anything else would restate a chain transaction.
    if (!PAYLOAD_KINDS.has(body.kind)) return "Only a launch, an offer or a bid may carry a payload.";
  }
  if (!/^[0-9a-f]{128}$/.test(signature)) return "Malformed signature.";
  if (!verifySignature(hexToBytes(body.actor), activityDigest(body), hexToBytes(signature))) {
    return "Signature does not verify against the stated actor.";
  }
  return null;
}

/**
 * The reference an event carrying `meta` uses: the payload's own digest, so a
 * holder of the payload can check the event is about exactly those bytes.
 */
export function payloadRef(meta: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(meta)));
}

export function isValid(signed: SignedActivity): boolean {
  return faultIn(signed) === null;
}
