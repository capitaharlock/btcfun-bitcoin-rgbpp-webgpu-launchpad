import { beforeEach, describe, expect, it } from "vitest";

import { LocalLedger, launchOfExport } from "./store";
import { claimChallenge, type LaunchRules } from "./rules";
import { signClaim, signTransfer } from "./author";
import { GENESIS_PREV, LedgerError } from "./types";
import { deriveKey, identityOf, type Vault, type WalletKey } from "../bitcoin";
import { recompute } from "../mining";
import { CANDIDATE } from "../emission";

const RULES: LaunchRules = {
  launch: "store",
  version: "btcfun/test",
  network: "testnet4",
  schedule: CANDIDATE,
  epochBlocks: 144,
  minClz: 8,
  ticketSats: 1_000,
};

/** A Map standing in for the browser's storage; the store only needs the API. */
function installStorage() {
  const map = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

function vault(seed: number): Vault {
  const key = deriveKey(new Uint8Array(32).fill(seed));
  return {
    kind: "local",
    address: key.address,
    identity: identityOf(key),
    label: "test",
    use: async <T,>(fn: (k: WalletKey) => T | Promise<T>) => fn(key),
  };
}

async function claim(ledger: LocalLedger, who: Vault, ticket: string) {
  const draft = {
    kind: "claim" as const, seq: 0, prev: GENESIS_PREV, at: "", launch: RULES.launch,
    author: who.identity, epoch: 0, btcBlockHash: "a".repeat(64), nonce: "0", clz: 0,
    amount: "0", ticket, ticketSats: RULES.ticketSats,
  };
  const challenge = claimChallenge(RULES, draft);
  let nonce = 0n;
  while (recompute(challenge, nonce).clz < RULES.minClz) nonce++;
  const record = await signClaim(who, ledger, RULES, {
    epoch: 0, btcBlockHash: "a".repeat(64), nonce, clz: recompute(challenge, nonce).clz,
    ticket, ticketSats: RULES.ticketSats,
  });
  ledger.append(record);
}

describe("receiving a chain", () => {
  beforeEach(installStorage);

  it("accepts a chain that extends the one held", async () => {
    const alice = vault(1);
    const bob = vault(2);
    const sender = new LocalLedger(RULES);
    await claim(sender, alice, "1".repeat(64));
    const first = sender.export();

    // Bob already received the first record; now Alice sends him tokens.
    installStorage();
    const receiver = new LocalLedger(RULES);
    receiver.import(first, "extend");

    installStorage();
    const again = new LocalLedger(RULES);
    again.import(first, "replace");
    again.append(await signTransfer(alice, again, RULES, { to: bob.identity, amount: 5n }));
    const extended = again.export();

    installStorage();
    const bobsBrowser = new LocalLedger(RULES);
    bobsBrowser.import(first, "extend");
    const state = bobsBrowser.import(extended, "extend");
    expect(state.balances.get(bob.identity)).toBe(5n);
  });

  it("refuses a chain that would discard records already held", async () => {
    const alice = vault(1);
    const carol = vault(3);

    const mine = new LocalLedger(RULES);
    await claim(mine, alice, "1".repeat(64));
    const held = mine.export();

    installStorage();
    const other = new LocalLedger(RULES);
    await claim(other, carol, "2".repeat(64));
    const divergent = other.export();

    installStorage();
    const browser = new LocalLedger(RULES);
    browser.import(held, "extend");
    expect(() => browser.import(divergent, "extend")).toThrow(/discard 1 of your records/);
    // What was held is untouched.
    expect(browser.records()).toHaveLength(1);
    expect(browser.records()[0].body.author).toBe(alice.identity);

    // Restoring your own backup is a different act, and may replace.
    expect(() => browser.import(divergent, "replace")).not.toThrow();
  });

  it("names the launch an export belongs to, and refuses what is not an export", () => {
    expect(launchOfExport(JSON.stringify({ launch: "mesh", records: [] }))).toBe("mesh");
    expect(() => launchOfExport("{")).toThrow(LedgerError);
    expect(() => launchOfExport(JSON.stringify({ records: [] }))).toThrow(/not an exported chain/);
  });
});
