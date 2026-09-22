/* A launch's registration and btc.fun's certificate over it — its admission.
 *
 * Creating a launch is paid: the creator's Bitcoin transaction pays
 * `REGISTRATION_SATS` to the platform and commits, in an OP_RETURN, to the
 * launch's terms (`registrationCommitment`). btc.fun's signer checks that
 * payment and signs the terms together with the registration's txid. The mint
 * script arms a paid miner cell — every miner's first way into a launch — only
 * when that arming carries the signature (`contracts/mint-core` `admitted`),
 * and nothing else leads to a mint. So a token of this script can be minted
 * only where btc.fun admitted its launch.
 *
 * The admission travels with the arming, not in the terms: 96 more bytes in
 * the terms would be 96 more CKB in every miner cell's type script, more than
 * the paymaster's cell can hold. The token's identity is the terms, as before.
 *
 * Pure bytes and hashes, with no chain library, so the browser, the Worker
 * that signs and the scripts share one implementation, tested against the
 * vectors the Rust side is tested against (`contracts/vectors/reward.json`).
 */

import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

/** Sats a registration pays the platform (`contracts/mint-core` `REGISTRATION_SATS`). */
export const REGISTRATION_SATS = 20_000;

/** A key anyone may sign with — secret `0x42` × 32 — for tests only (`contracts/mint-core` `TEST_CERT_KEY`). */
export const TEST_CERT_SECRET = "42".repeat(32);
export const TEST_CERT_KEY = "24653eac434488002cc06bbfb7f10fe18991e35f9fe4302dbea6d2353dc0ab1c";

/**
 * btc.fun's certificate key, BIP340 x-only (`contracts/mint-core`
 * `PLATFORM_CERT_KEY`). Unit and browser tests build with
 * `VITE_PLATFORM_CERT_KEY` set to the test key, as the contract tests build
 * the script to trust it; a production build sets nothing. Read defensively:
 * the Worker bundles this module without Vite's `import.meta.env`.
 */
export const PLATFORM_CERT_KEY: string =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PLATFORM_CERT_KEY ??
  // Vitest sets its `env` on the process, not on `import.meta.env`.
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_PLATFORM_CERT_KEY ??
  "9f21697aa0e61bc65c23eb84a525bb1a4282211d265d3d080e49371ef809bdfa";

const CERTIFICATE_DOMAIN = utf8ToBytes("btc.fun/launch-certificate/v1");
const REGISTRATION_DOMAIN = utf8ToBytes("btc.fun/launch-registration/v1");

/** A txid as explorers print it, in the byte order Bitcoin hashes it. */
function internal(txid: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new RangeError("a txid is 64 lowercase hex characters");
  return hexToBytes(txid).reverse();
}

/** The 32 bytes a registration's OP_RETURN carries: `sha256(domain ‖ terms args)`. */
export function registrationCommitment(args: Uint8Array): Uint8Array {
  return sha256(concatBytes(REGISTRATION_DOMAIN, args));
}

/** What a certificate signs: `sha256(domain ‖ terms args ‖ registration txid)`. */
export function certificateMessage(args: Uint8Array, registration: string): Uint8Array {
  return sha256(concatBytes(CERTIFICATE_DOMAIN, args, internal(registration)));
}

/**
 * The platform's signature over the terms and their registration. Signed
 * deterministically (zero auxiliary randomness): the same launch always gets
 * the same certificate, however many times it is asked for.
 */
export function signCertificate(args: Uint8Array, registration: string, secret: Uint8Array): Uint8Array {
  return schnorr.sign(certificateMessage(args, registration), secret, new Uint8Array(32));
}

/**
 * True when `key` (x-only hex) signed these terms and registration. Never
 * throws: announcements are untrusted input. An all-zero registration names no
 * payment and is refused whoever signed it, as the mint script refuses it — the
 * platform's own launches once went unpaid that way, and none may any more.
 */
export function admitted(args: Uint8Array, registration: string, certificate: string, key: string = PLATFORM_CERT_KEY): boolean {
  try {
    if (/^0+$/.test(registration)) return false;
    return /^[0-9a-f]{128}$/.test(certificate) && schnorr.verify(hexToBytes(certificate), certificateMessage(args, registration), key);
  } catch {
    return false;
  }
}

/** The admission as the arming of a paid cell carries it: registration txid (internal order) ‖ signature. */
export function admissionBytes(registration: string, certificate: string): Uint8Array {
  return concatBytes(internal(registration), hexToBytes(certificate));
}

/** A Bitcoin output as an explorer reports it. */
export interface PaidOutput {
  scriptHex: string;
  value: number;
}

/**
 * Why a transaction does not register these terms, or null when it does: it
 * must pay the platform at least `REGISTRATION_SATS` and carry the terms'
 * commitment as a 32-byte OP_RETURN.
 */
export function registrationFault(outputs: readonly PaidOutput[], args: Uint8Array, platformScriptHex: string): string | null {
  const paid = outputs.filter((o) => o.scriptHex === platformScriptHex).reduce((n, o) => n + o.value, 0);
  if (paid < REGISTRATION_SATS) return `it pays the platform ${paid} sats, not ${REGISTRATION_SATS}`;
  const memo = "6a20" + bytesToHex(registrationCommitment(args));
  if (!outputs.some((o) => o.scriptHex === memo)) return "it does not commit to this launch";
  return null;
}
