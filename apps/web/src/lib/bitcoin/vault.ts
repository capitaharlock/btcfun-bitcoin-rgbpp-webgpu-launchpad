/* Where the wallet's root entropy comes from.
 *
 * Three adapters behind one interface:
 *
 *   passkey — entropy is HMAC output from the platform authenticator, produced
 *     fresh on every use behind a biometric gesture and wiped straight after.
 *     Nothing secret is ever written to disk. This is the real one.
 *
 *   local — entropy is random bytes kept in this browser's localStorage. Weaker
 *     by construction, and labelled as such everywhere it surfaces, but it is
 *     what lets someone try the app in a browser or automation context with no
 *     platform authenticator. Offering it silently instead of saying so would
 *     be the dishonest version of this trade-off.
 *
 *   demo — entropy is a constant in this file, so every visitor who picks it
 *     opens the same testnet3 wallet. It exists so a person sent a link can mint
 *     and trade within a minute, on coins someone else put there. The key is
 *     public on purpose; it is refused outright on any other network.
 *
 * Callers never touch entropy. They call `use()`, which derives a key, hands it
 * over for the duration of one callback and wipes it. A key that outlives its
 * operation is a key that leaks into a heap snapshot.
 */

import { fromBase64, hexToBytes, toBase64 } from "../bytes";
import { deriveAddress, deriveKey, identityOf, type WalletKey } from "./keys";
import { ACTIVE, matchesNetwork, type NetworkConfig } from "./network";
import * as passkey from "./passkey";

const STORAGE_KEY = "btcfun:vault:v1";

/**
 * Root entropy of the shared demo wallet (tb1qjjq482m9pj7dvge0l2r07a3fcyflktrzgzf6tz).
 *
 * Public by design: anyone reading this file holds the wallet, and anyone who
 * picks "demo wallet" signs with it. That is acceptable only because testnet3
 * coins have no value — `demoEntropy` refuses every other network, so a build
 * pointed at mainnet can never derive, display or fund this address.
 */
const DEMO_ENTROPY_HEX = "8d726fd1f55a135a3563dfb6e8eb786adf7c1ac195354029d1a3f68aa1753fd1";

/** Persisted, non-secret except for `secret` on the local adapter. */
type StoredVault =
  | { kind: "passkey"; address: string; identity: string; credential: passkey.PasskeyRecord }
  /** `secret` is base64 root entropy. Not a secure store. */
  | { kind: "local"; address: string; identity: string; secret: string }
  /** No secret stored: the entropy is `DEMO_ENTROPY_HEX`. */
  | { kind: "demo"; address: string; identity: string };

export type VaultKind = StoredVault["kind"];

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
    if (parsed.kind === "passkey" && !parsed.credential) return null;
    if (parsed.kind === "local" && !parsed.secret) return null;
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

/**
 * Log out: forget the wallet on this browser.
 *
 * What that costs depends on the kind, and the UI says so before calling it: a
 * passkey wallet is re-derived from the same passkey, the demo wallet from the
 * constant above, but a local wallet's only copy of its entropy is the entry
 * removed here. Per-address records (operations in flight, kept best hashes)
 * stay: they are keyed by address and still guard the seals of that wallet if
 * it is opened again.
 */
export function forget(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function hydrate(stored: StoredVault): Vault {
  const { address, identity } = stored;
  switch (stored.kind) {
    case "passkey": {
      const { credential } = stored;
      return {
        kind: "passkey",
        address,
        identity,
        label: "Passkey · verified per use",
        use: async (fn) => withKey(await passkey.unlock(credential), fn),
      };
    }
    case "local": {
      const { secret } = stored;
      return {
        kind: "local",
        address,
        identity,
        label: "Browser key · stored in this browser",
        use: async (fn) => withKey(fromBase64(secret), fn),
      };
    }
    case "demo":
      return {
        kind: "demo",
        address,
        identity,
        label: "Demo wallet · shared, key is public",
        use: async (fn) => withKey(demoEntropy(ACTIVE), fn),
      };
  }
}

/**
 * The demo wallet's entropy, as a fresh copy the caller may wipe.
 *
 * Throws on anything but testnet3: a key published in the source is only
 * harmless where the coins are worthless, and a mainnet build that quietly
 * offered it would invite people to fund an address anyone can empty.
 */
export function demoEntropy(network: NetworkConfig): Uint8Array {
  if (network.id !== "testnet3") {
    throw new Error(`The shared demo wallet exists only on testnet3, not on ${network.label}.`);
  }
  return hexToBytes(DEMO_ENTROPY_HEX);
}

/** Derive, run, wipe — the one place a private key is allowed to exist. */
async function withKey<T>(
  entropy: Uint8Array,
  fn: (key: WalletKey) => T | Promise<T>,
  network: NetworkConfig = ACTIVE,
): Promise<T> {
  const key = deriveKey(entropy, network);
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

/**
 * Connect the shared demo wallet. Instant: no gesture, nothing random, nothing
 * secret written — the entropy is rebuilt from the constant on every use.
 */
export async function connectDemo(network: NetworkConfig = ACTIVE): Promise<Vault> {
  const entropy = demoEntropy(network);
  const address = deriveAddress(entropy, network);
  const identity = await withKey(entropy, identityOf, network);
  const stored: StoredVault = { kind: "demo", address, identity };
  write(stored);
  return hydrate(stored);
}

/** Create a browser-stored wallet. Explicit: never a silent fallback. */
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
 * Import an existing browser-stored wallet from its 32-byte entropy.
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

/** Export a browser-stored wallet's entropy so it can be re-imported. Local only. */
export function exportLocalSecret(): Uint8Array | null {
  const stored = read();
  if (!stored || stored.kind !== "local" || !stored.secret) return null;
  return fromBase64(stored.secret);
}
