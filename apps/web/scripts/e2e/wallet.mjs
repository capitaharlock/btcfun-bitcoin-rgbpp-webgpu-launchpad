/* The end-to-end test wallet.
 *
 * A real testnet wallet that the runners spend from. It is a separate key
 * from anything a person uses in the browser, and it is the only secret this
 * repository's tooling holds.
 *
 * WHERE THE SECRET LIVES. In the local workspace (`../local.mjs`), ignored by
 * git. It is never printed except by `mnemonic`, never committed, and never
 * sent anywhere. `E2E_MNEMONIC` overrides it, which is how CI would supply one
 * without a file on disk.
 *
 * WHY A MNEMONIC. The entropy is stored as a standard BIP39 phrase on the
 * standard BIP84 path, so the funds are never trapped in this tooling: any
 * wallet can import the phrase and sweep whatever is left.
 *
 * TESTNET ONLY. `assertTestnet` refuses to run if the build is pointed at
 * mainnet. This wallet signs unattended, in a loop, from a file on disk —
 * every property that makes it useful here makes it unacceptable for real
 * money.
 */

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { storedMnemonic, WALLET_FILE } from "../local.mjs";
import { load } from "./load.mjs";

export class WalletMissing extends Error {
  constructor() {
    super(
      "No end-to-end wallet yet. Run `npm run e2e:wallet` to create one, " +
        "then fund the address it prints.",
    );
    this.name = "WalletMissing";
  }
}

/** Refuse to touch anything but testnet. */
export async function assertTestnet() {
  const { ACTIVE } = await load("lib/bitcoin/network.ts");
  if (ACTIVE.id === "mainnet") {
    throw new Error(
      `The end-to-end runner is testnet-only; this build points at ${ACTIVE.id}. ` +
        "It signs unattended from a key on disk, which must never happen with real funds.",
    );
  }
  return ACTIVE;
}

/** Create the wallet if absent. Returns `{ created, mnemonic, address }`. */
export async function ensureWallet() {
  const existing = await read();
  if (existing) return { created: false, ...existing };

  const { entropyToMnemonic } = await import("@scure/bip39");
  const { wordlist } = await import("@scure/bip39/wordlists/english");
  const { randomBytes } = await import("node:crypto");

  const mnemonic = entropyToMnemonic(new Uint8Array(randomBytes(32)), wordlist);
  const address = await addressFor(mnemonic);

  await mkdir(dirname(WALLET_FILE), { recursive: true });
  await writeFile(
    WALLET_FILE,
    `${JSON.stringify({ mnemonic, address, createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
  // Owner-only: this file is a spending key, testnet or not.
  await chmod(WALLET_FILE, 0o600);

  return { created: true, mnemonic, address };
}

/** The stored wallet, or null. `E2E_MNEMONIC` wins when set. */
async function read() {
  const mnemonic = storedMnemonic();
  return mnemonic ? { mnemonic, address: await addressFor(mnemonic) } : null;
}

async function entropyOf(mnemonic) {
  const { mnemonicToEntropy } = await import("@scure/bip39");
  const { wordlist } = await import("@scure/bip39/wordlists/english");
  return mnemonicToEntropy(mnemonic, wordlist);
}

async function addressFor(mnemonic) {
  const { deriveAddress } = await load("lib/bitcoin/keys.ts");
  return deriveAddress(await entropyOf(mnemonic));
}

/**
 * A `Vault` over the test wallet, so the runner drives `signClaim`,
 * `signOffer` and `pay` through the same port the browser uses.
 *
 * The key is derived per call and wiped straight after, matching the passkey
 * adapter's lifetime rather than holding one key for the whole run.
 */
export async function testVault() {
  const stored = await read();
  if (!stored) throw new WalletMissing();

  const { deriveKey, identityOf } = await load("lib/bitcoin/keys.ts");
  const entropy = await entropyOf(stored.mnemonic);

  const probe = deriveKey(entropy);
  const identity = identityOf(probe);
  const { address } = probe;
  probe.wipe();

  return {
    kind: "local",
    address,
    identity,
    label: "end-to-end test wallet",
    async use(fn) {
      const key = deriveKey(entropy);
      try {
        return await fn(key);
      } finally {
        key.wipe();
      }
    },
  };
}

/** Confirmed and pending balance, in satoshis. */
export async function balanceOf(address) {
  const { getBalance } = await load("lib/bitcoin/provider.ts");
  return getBalance(address);
}

export { WALLET_FILE };
