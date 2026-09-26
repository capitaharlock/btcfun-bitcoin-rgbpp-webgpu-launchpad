/* Passkey-backed key material, via the WebAuthn PRF extension.
 *
 * The authenticator holds a secret it will only evaluate after a user
 * verification gesture — Touch ID, Face ID, Windows Hello. `prf.eval` asks it
 * for HMAC(secret, salt), which is 32 bytes that never existed anywhere else
 * and cannot be extracted from the device. Those bytes are the wallet's root
 * entropy. There is no seed phrase to leak, no password to forget, and no
 * private key in localStorage — only the credential id needed to ask again.
 *
 * WHAT THIS IS NOT. It is not hardware signing. The authenticator gates the
 * *derivation*, not each signature: the PRF output crosses into JavaScript, and
 * so does every key derived from it, for as long as an operation takes. Page
 * script — a compromised dependency, an XSS, anything served from this origin —
 * can observe them while they exist. The wipes below and in `keys.ts` are
 * best-effort: they clear the byte arrays we own, but a JavaScript engine is
 * free to have copied them and strings cannot be cleared at all. A wallet that
 * signs inside the authenticator, or an external wallet, is a different and
 * stronger design; PROTOCOL.md's real-fund gate is the place that decides
 * whether this one is good enough.
 *
 * Two rules the implementation depends on:
 *
 *   The salt is domain-separated to this project. Reusing another product's
 *   salt label on a shared passkey would silently derive *their* wallet, which
 *   is a surprising and dangerous kind of key reuse.
 *
 *   PRF output is wiped by the caller as soon as a key is derived from it. It
 *   is the only secret this module holds.
 */

import { fromBase64, fromBase64Url, toBase64, toBase64Url, type Bytes } from "@/domain/codec";
import { env } from "@/config/env";

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
 * The page's own hostname, verbatim, which is always a valid rpId for that
 * origin. It used to take the last two labels of the hostname so a passkey
 * enrolled on `www.` would work on the apex — but that rule is only correct for
 * single-label public suffixes. On `btcfun.workers.dev`, the deployment target,
 * it produced `workers.dev`: a public suffix, which every authenticator
 * rejects, so nobody could have enrolled at all. It was equally wrong for
 * `example.co.uk`.
 *
 * Getting this right in general needs the Public Suffix List, which is not
 * worth shipping to decide one string. So the apex case is *configured* rather
 * than guessed: set `VITE_RP_ID` to the registrable domain when the app is
 * served from several subdomains that must share one wallet. The value is
 * recorded in the credential, so changing it later is a wallet migration, not a
 * setting — which is another reason it should be a deliberate act.
 */
function relyingPartyId(): string {
  const configured = env("VITE_RP_ID");
  if (typeof configured === "string" && configured.length > 0) return configured;
  // localhost is the only insecure origin authenticators accept, and it is
  // already a bare hostname, so no special case is needed.
  return window.location.hostname;
}

/** Whether WebAuthn is present at all. Says nothing about PRF — see `prfSupport`. */
export function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function" &&
    !!window.crypto?.subtle
  );
}

/** What is known about PRF availability before asking the authenticator. */
export type PrfSupport = "available" | "unavailable" | "unknown";

/**
 * Whether this browser will evaluate the PRF extension.
 *
 * `isSupported` only reports that WebAuthn exists, and a wallet needs more than
 * that: an authenticator without PRF enrols happily and then returns no secret,
 * which surfaces as a failure *after* the visitor has been asked for Touch ID.
 * `getClientCapabilities` answers it up front where implemented; where it is
 * not, the honest answer is "unknown" and the enrolment path still checks.
 */
export async function prfSupport(): Promise<PrfSupport> {
  if (!isSupported()) return "unavailable";
  const capabilities = (
    window.PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    }
  ).getClientCapabilities;
  if (typeof capabilities !== "function") return "unknown";
  try {
    const result = await capabilities.call(window.PublicKeyCredential);
    const prf = result["extension:prf"];
    return prf === undefined ? "unknown" : prf ? "available" : "unavailable";
  } catch {
    return "unknown";
  }
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
  if ((await prfSupport()) === "unavailable") {
    throw new Error(
      "This browser will not evaluate the WebAuthn PRF extension, which a " +
        "passkey wallet needs. Use the local demo wallet instead.",
    );
  }

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
