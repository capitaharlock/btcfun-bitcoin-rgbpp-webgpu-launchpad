/* The operator's local workspace: `apps/web/.local/`, ignored by git.
 *
 * Everything the testnet tooling keeps on one machine lives under it, and
 * this module is the only place that knows the layout:
 *
 *   .local/wallets/e2e.json   the test wallet's BIP39 phrase (chmod 600).
 *                             Alice, Bob and the demo wallet are all derived
 *                             from it (`rgbpp/kit.mjs`), so it is the one secret.
 *   .local/runs/<name>.json   state a runner resumes from between steps.
 *
 * `E2E_MNEMONIC` overrides the wallet file, which is how CI would supply the
 * secret without one on disk.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export const LOCAL_DIR = fileURLToPath(new URL("../.local/", import.meta.url));
export const WALLET_FILE = fileURLToPath(new URL("../.local/wallets/e2e.json", import.meta.url));

/** The state file a runner named `name` resumes from. */
export const runFile = (name) => fileURLToPath(new URL(`../.local/runs/${name}.json`, import.meta.url));

/**
 * The test wallet's phrase — `E2E_MNEMONIC`, else the wallet file — or null
 * when neither exists. A phrase that is present but not valid BIP39 throws:
 * a typo must not read as "no wallet yet" and invite a fresh one over it.
 */
export function storedMnemonic() {
  let phrase = process.env.E2E_MNEMONIC?.trim();
  if (!phrase) {
    try {
      phrase = JSON.parse(readFileSync(WALLET_FILE, "utf8")).mnemonic;
    } catch {
      return null;
    }
  }
  if (typeof phrase !== "string") return null;
  if (!validateMnemonic(phrase, wordlist)) throw new Error("the end-to-end mnemonic is not a valid BIP39 phrase");
  return phrase;
}

/** `storedMnemonic`, for the callers that cannot run without it. */
export function requireMnemonic() {
  const phrase = storedMnemonic();
  if (!phrase) throw new Error(`no end-to-end wallet: run \`npm run e2e:wallet\` (writes ${WALLET_FILE})`);
  return phrase;
}
