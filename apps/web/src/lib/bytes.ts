/* Byte encodings used across mining, the wallet and the ledger.
 *
 * One home for these, because the alternative is three nearly-identical hex
 * helpers that eventually disagree about a leading "0x" or an odd-length string.
 * Nothing here is hot-path: the miner writes bytes directly.
 */

/**
 * A byte array backed by a plain ArrayBuffer.
 *
 * WebAuthn and WebCrypto take `BufferSource`, which excludes a view over a
 * SharedArrayBuffer — and that is what plain `Uint8Array` widens to since
 * TypeScript 5.7. Declaring it here once keeps the casts out of call sites.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

const HEX = /^[0-9a-fA-F]*$/;

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Bytes {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new RangeError("hexToBytes: odd-length string");
  if (!HEX.test(clean)) throw new RangeError("hexToBytes: not hexadecimal");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Constant-time-ish equality. Used on digests, so length is public anyway. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── base64 / base64url ───────────────────────────────────────────────────────
// WebAuthn hands back ArrayBuffers that have to survive a round trip through
// localStorage JSON, which is the only reason these exist.

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Bytes {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  return fromBase64(padded + "=".repeat(pad));
}
