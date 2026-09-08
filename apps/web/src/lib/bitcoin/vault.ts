/* Where the wallet's root entropy comes from.
 *
 * Two adapters behind one interface:
 *
 *   passkey — entropy is HMAC output from the platform authenticator, produced
 *     fresh on every use behind a biometric gesture and wiped straight after.
 *     Nothing secret is ever written to disk. This is the real one.
 *
 *   local — entropy is random bytes kept in this browser's localStorage. Weaker
 *     by construction, and labelled as such everywhere it surfaces, but it is
 *     what lets someone try the demo in a browser or automation context with no
 *     platform authenticator. Offering it silently instead of saying so would
 *     be the dishonest version of this trade-off.
 *
 * Callers never touch entropy. They call `use()`, which derives a key, hands it
 * over for the duration of one callback and wipes it. A key that outlives its
 * operation is a key that leaks into a heap snapshot.
 */

import { fromBase64, toBase64 } from "../bytes";
import { deriveAddress, deriveKey, identityOf, type WalletKey } from "./keys";
import { ACTIVE, matchesNetwork } from "./network";
import * as passkey from "./passkey";

const STORAGE_KEY = "btcfun:vault:v1";

export type VaultKind = "passkey" | "local";

/** Persisted, non-secret except for `secret` on the local adapter. */
interface StoredVault {
  kind: VaultKind;
  address: string;
  identity: string;
  /** Present when kind === "passkey". */
  credential?: passkey.PasskeyRecord;
  /** Present when kind === "local": base64 root entropy. Not a secure store. */
  secret?: string;
}

export interface Vault {
  readonly kind: VaultKind;
  readonly address: string;
  /** Compressed public key hex. The identity ledger records are signed under. */
  readonly identity: string;
  /** Short description of how this wallet is protected, for the UI. */
  readonly label: string;
  /**
   * Derive the key, run `fn`, wipe. The passkey adapter prompts for user
   * verification here, so call it once per operation, not once per render.
   */
  use<T>(fn: (key: WalletKey) => T | Promise<T>): Promise<T>;
}

export function isPasskeySupported(): boolean {
  return passkey.isSupported();
}

/** Whether PRF is actually available, which is what a passkey wallet needs. */
export const passkeyPrfSupport = passkey.prfSupport;

function read(): StoredVault | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredVault;
    if (!parsed.address || !parsed.identity) return null;
    // A cached address from another network would be shown, and funded, in
    // error. Treat it as absent and make the visitor reconnect.
    if (!matchesNetwork(parsed.address)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(vault: StoredVault): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
}

export function forget(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function hydrate(stored: StoredVault): Vault {
  if (stored.kind === "passkey") {
    const credential = stored.credential;
    if (!credential) throw new Error("Stored passkey vault has no credential");
    return {
      kind: "passkey",
      address: stored.address,
      identity: stored.identity,
      label: "Passkey · verified per use",
      use: async (fn) => {
        const secret = await passkey.unlock(credential);
        return withKey(secret, fn);
      },
    };
  }

  const secret = stored.secret;
  if (!secret) throw new Error("Stored local vault has no secret");
  return {
    kind: "local",
    address: stored.address,
    identity: stored.identity,
    label: "Demo key · stored in this browser",
    use: async (fn) => withKey(fromBase64(secret), fn),
  };
}

/** Derive, run, wipe — the one place a private key is allowed to exist. */
async function withKey<T>(entropy: Uint8Array, fn: (key: WalletKey) => T | Promise<T>): Promise<T> {
  const key = deriveKey(entropy, ACTIVE);
  entropy.fill(0);
  try {
    return await fn(key);
  } finally {
    key.wipe();
  }
}

/** The vault already on this device, or null. Never prompts. */
export function current(): Vault | null {
  const stored = read();
  return stored ? hydrate(stored) : null;
}

/**
 * Connect a passkey wallet.
 *
 * Tries to find an existing credential before enrolling a new one, because a
 * passkey synced through a keychain outlives cleared site data — and enrolling
 * blindly would hand the visitor a different wallet and the impression that
 * their coins vanished.
 */
export async function connectPasskey(): Promise<Vault> {
  const result = (await passkey.discover()) ?? (await passkey.enroll());
  const address = deriveAddress(result.secret, ACTIVE);
  const identity = await withKey(result.secret, identityOf);

  const stored: StoredVault = { kind: "passkey", address, identity, credential: result.record };
  write(stored);
  return hydrate(stored);
}

/** Create the browser-stored demo wallet. Explicit: never a silent fallback. */
export async function createLocal(): Promise<Vault> {
  const entropy = crypto.getRandomValues(new Uint8Array(32));
  const address = deriveAddress(entropy, ACTIVE);
  const identity = await withKey(entropy.slice(), identityOf);

  const stored: StoredVault = {
    kind: "local",
    address,
    identity,
    secret: toBase64(entropy),
  };
  entropy.fill(0);
  write(stored);
  return hydrate(stored);
}

/**
 * Import an existing demo wallet from its 32-byte entropy, hex-encoded.
 *
 * This is how a funded address survives a cleared browser during a demo, and
 * how the operator can pre-fund one wallet and hand it to testers.
 */
export async function importLocal(entropy: Uint8Array): Promise<Vault> {
  if (entropy.length !== 32) throw new RangeError("importLocal: expected 32 bytes");
  const address = deriveAddress(entropy, ACTIVE);
  const identity = await withKey(entropy.slice(), identityOf);
  const stored: StoredVault = { kind: "local", address, identity, secret: toBase64(entropy) };
  write(stored);
  return hydrate(stored);
}

/** Export the demo wallet's entropy so it can be re-imported. Local only. */
export function exportLocalSecret(): Uint8Array | null {
  const stored = read();
  if (!stored || stored.kind !== "local" || !stored.secret) return null;
  return fromBase64(stored.secret);
}
