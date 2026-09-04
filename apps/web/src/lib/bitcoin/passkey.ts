/* Passkey-backed key material, via the WebAuthn PRF extension.
 *
 * The authenticator holds a secret it will only evaluate after a user
 * verification gesture — Touch ID, Face ID, Windows Hello. `prf.eval` asks it
 * for HMAC(secret, salt), which is 32 bytes that never existed anywhere else
 * and cannot be extracted from the device. Those bytes are the wallet's root
 * entropy. There is no seed phrase to leak, no password to forget, and no
 * private key in localStorage — only the credential id needed to ask again.
 *
 * Two rules the implementation depends on:
 *
 *   The salt is domain-separated to this project. Reusing another product's
 *   salt label on a shared passkey would silently derive *their* wallet, which
 *   is a surprising and dangerous kind of key reuse.
 *
 *   PRF output is wiped by the caller as soon as a key is derived from it. It
 *   is the only secret in the process.
 */

import { fromBase64, fromBase64Url, toBase64, toBase64Url, type Bytes } from "../bytes";

/** Domain separation. Changing this string changes every derived wallet. */
const SALT_LABEL = "btc.fun/wallet/v1";

const RP_NAME = "btc.fun";

/** Credential metadata worth keeping between visits. Nothing here is secret. */
export interface PasskeyRecord {
  credentialId: string; // base64url
  salt: string; // base64
  rpId: string;
  enrolledAt: string;
}

export interface PrfResult {
  /** 32 bytes of root entropy. The caller must `.fill(0)` it. */
  secret: Bytes;
  record: PasskeyRecord;
}

/**
 * The relying party id.
 *
 * Platform authenticators refuse an rpId that is not the page's origin or a
 * registrable suffix of it, and localhost is the only insecure origin they
 * accept — so development has to use it verbatim.
 */
function relyingPartyId(): string {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "localhost";
  // Strip a leading subdomain so a passkey enrolled on www. works on the apex.
  const parts = host.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : host;
}

export function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function" &&
    !!window.crypto?.subtle
  );
}

async function saltBytes(): Promise<Bytes> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT_LABEL));
  return new Uint8Array(digest);
}

/** Pull the PRF output out of an assertion, with a specific error if absent. */
function extractPrf(credential: PublicKeyCredential): Bytes {
  const results = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const first = results?.prf?.results?.first;
  if (!first) {
    throw new Error(
      "This authenticator did not return PRF output. A passkey wallet needs an " +
        "authenticator that supports the WebAuthn PRF extension.",
    );
  }
  return new Uint8Array(first);
}

/** Enrol a new passkey on this device and derive its secret. */
export async function enroll(): Promise<PrfResult> {
  if (!isSupported()) throw new Error("Passkeys are not supported in this browser.");

  const rpId = relyingPartyId();
  const salt = await saltBytes();

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: rpId, name: RP_NAME },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "btc.fun wallet",
        displayName: "btc.fun wallet",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        // The built-in authenticator, not a roaming key: combined with a
        // populated allowCredentials at unlock time this is what keeps the
        // browser from offering a cross-device QR flow every session.
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } },
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey enrolment returned no credential.");

  return {
    secret: extractPrf(credential),
    record: {
      credentialId: toBase64Url(new Uint8Array(credential.rawId)),
      salt: toBase64(salt),
      rpId,
      enrolledAt: new Date().toISOString(),
    },
  };
}

/**
 * Ask the platform for any passkey already enrolled for this origin.
 *
 * This is what makes "disconnect, then connect again" restore the same wallet
 * rather than mint a new one: the credential may live in iCloud Keychain or a
 * password manager and still be present after local state is cleared. Returns
 * null when the user cancels or nothing is found, so the caller can enrol.
 */
export async function discover(): Promise<PrfResult | null> {
  if (!isSupported()) throw new Error("Passkeys are not supported in this browser.");

  const rpId = relyingPartyId();
  const salt = await saltBytes();

  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [],
        userVerification: "required",
        timeout: 60_000,
        rpId,
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "AbortError") return null;
    throw err;
  }

  if (!assertion) return null;

  return {
    secret: extractPrf(assertion),
    record: {
      credentialId: toBase64Url(new Uint8Array(assertion.rawId)),
      salt: toBase64(salt),
      rpId,
      enrolledAt: new Date().toISOString(),
    },
  };
}

/** Re-derive the secret for a known credential. Prompts for verification. */
export async function unlock(record: PasskeyRecord): Promise<Bytes> {
  if (!isSupported()) throw new Error("Passkeys are not supported in this browser.");

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: fromBase64Url(record.credentialId), type: "public-key" }],
      userVerification: "required",
      timeout: 60_000,
      rpId: record.rpId,
      extensions: { prf: { eval: { first: fromBase64(record.salt) } } },
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Passkey unlock returned no assertion.");
  return extractPrf(assertion);
}
