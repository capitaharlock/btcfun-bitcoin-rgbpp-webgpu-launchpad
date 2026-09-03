/* Canonical mining challenge — PROTOCOL.md §4.2.
 *
 * "Canonical challenges bind protocol version, network, launch, epoch,
 *  accepted Bitcoin block, ticket, authorized owner/recipient and nonce."
 *
 * Every field is length-prefixed so two different field sets cannot serialise
 * to the same bytes. The nonce is NOT part of the committed challenge: it is
 * appended to the challenge digest in the hot loop, so the expensive part of
 * the preimage is computed once per epoch rather than once per attempt.
 *
 * A UTXO reference alone is not proof of control (§4.2) — `owner` here is the
 * authorized recipient commitment, and the real system must additionally carry
 * an authorization proof. This prototype does not fabricate one.
 */

import { sha256Short, wordsToHex } from "./sha256";

export interface ChallengeFields {
  /** Protocol version tag. */
  version: string;
  /** Network tag, e.g. "signet" / "testnet". */
  network: string;
  /** Launch identifier. */
  launch: string;
  /** Epoch index within the launch. */
  epoch: number;
  /** Accepted Bitcoin block hash for this epoch (the clock, §6). */
  btcBlockHash: string;
  /** Ticket identifier admitted for this attempt. */
  ticket: string;
  /** Authorized owner/recipient commitment. */
  owner: string;
}

const enc = new TextEncoder();

/** Length-prefixed canonical serialization of the challenge fields. */
export function encodeChallenge(f: ChallengeFields): Uint8Array {
  const parts: Uint8Array[] = [];
  const push = (label: string, value: string) => {
    const b = enc.encode(`${label}:${value}`);
    const head = new Uint8Array(2);
    head[0] = (b.length >> 8) & 0xff;
    head[1] = b.length & 0xff;
    parts.push(head, b);
  };

  push("v", f.version);
  push("net", f.network);
  push("launch", f.launch);
  push("epoch", String(f.epoch));
  push("btc", f.btcBlockHash);
  push("ticket", f.ticket);
  push("owner", f.owner);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const digest = new Uint32Array(8);

/**
 * The 32-byte challenge digest the miner grinds against.
 * Long field sets are folded through an intermediate hash so the value passed
 * to the hot loop is always exactly 32 bytes.
 */
export function challengeDigest(f: ChallengeFields): Uint8Array {
  const encoded = encodeChallenge(f);
  const folded = encoded.length <= 55 ? encoded : foldLong(encoded);
  sha256Short(folded, digest);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (digest[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (digest[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (digest[i] >>> 8) & 0xff;
    out[i * 4 + 3] = digest[i] & 0xff;
  }
  return out;
}

/** Chain-fold an arbitrarily long input into 32 bytes using 55-byte chunks. */
function foldLong(input: Uint8Array): Uint8Array {
  const tmp = new Uint32Array(8);
  let acc = new Uint8Array(0);
  for (let off = 0; off < input.length; off += 23) {
    const chunk = input.subarray(off, Math.min(off + 23, input.length));
    const buf = new Uint8Array(acc.length + chunk.length);
    buf.set(acc, 0);
    buf.set(chunk, acc.length);
    sha256Short(buf, tmp);
    acc = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      acc[i * 4] = (tmp[i] >>> 24) & 0xff;
      acc[i * 4 + 1] = (tmp[i] >>> 16) & 0xff;
      acc[i * 4 + 2] = (tmp[i] >>> 8) & 0xff;
      acc[i * 4 + 3] = tmp[i] & 0xff;
    }
  }
  return acc;
}

export function challengeHex(f: ChallengeFields): string {
  sha256Short(challengeDigest(f).subarray(0, 32), digest);
  return wordsToHex(digest);
}

/** Deterministic placeholder block hash, so the prototype is reproducible. */
export function fakeBlockHash(height: number): string {
  const tmp = new Uint32Array(8);
  sha256Short(enc.encode(`btc-block-${height}`), tmp);
  return "0000" + wordsToHex(tmp).slice(4);
}
