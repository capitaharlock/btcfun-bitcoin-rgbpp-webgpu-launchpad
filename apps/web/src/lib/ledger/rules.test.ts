import { describe, expect, it } from "vitest";

import { allocate, claimChallenge, epochBudget, replay, type LaunchRules } from "./rules";
import { signClaim, signTransfer } from "./author";
import { decodeChain, decodeRecord } from "./decode";
import { recordDigest, recordId } from "./codec";
import { GENESIS_PREV, LedgerError, type Ledger, type LedgerState, type SignedRecord } from "./types";
import { deriveKey, identityOf, signDigest, type Vault, type WalletKey } from "../bitcoin";
import { recompute } from "../mining";
import { bytesToHex } from "../bytes";
import { CANDIDATE } from "../emission";

const RULES: LaunchRules = {
  launch: "test",
  version: "btcfun/test",
  network: "testnet4",
  schedule: CANDIDATE,
  epochBlocks: 144,
  minClz: 8,
  ticketSats: 1_000,
};

const BLOCK = "a".repeat(64);
const TICKET = (n: number) => String(n).padStart(64, "0");

/** A vault over fixed entropy — no browser, no passkey, deterministic. */
function testVault(seed: number): Vault {
  const entropy = new Uint8Array(32).fill(seed);
  const key = deriveKey(entropy);
  const identity = identityOf(key);
  return {
    kind: "local",
    address: key.address,
    identity,
    label: "test",
    use: async <T,>(fn: (k: WalletKey) => T | Promise<T>) => fn(key),
  };
}

/** In-memory `Ledger`, so rules are tested without storage in the way. */
class MemoryLedger implements Ledger {
  private log: SignedRecord[] = [];
  constructor(private readonly rules: LaunchRules) {}
  get launch() {
    return this.rules.launch;
  }
  records() {
    return [...this.log];
  }
  state(): LedgerState {
    return replay(this.log, this.rules);
  }
  append(record: SignedRecord): LedgerState {
    const next = [...this.log, record];
    const state = replay(next, this.rules);
    this.log = next;
    return state;
  }
  clear() {
    this.log = [];
  }
}

/** Grind until a candidate clears `minClz` — a few hundred attempts at 8 bits. */
function mine(challenge: Uint8Array, minClz: number): { nonce: bigint; clz: number } {
  for (let nonce = 0n; nonce < 5_000_000n; nonce++) {
    const candidate = recompute(challenge, nonce);
    if (candidate.clz >= minClz) return { nonce, clz: candidate.clz };
  }
  throw new Error("no candidate found");
}

/** Author a valid claim for `vault` in `epoch`, mining whatever it needs. */
async function claimFor(
  vault: Vault,
  ledger: Ledger,
  epoch: number,
  ticket: string,
  ticketSats = RULES.ticketSats,
) {
  const challenge = claimChallenge(RULES, {
    kind: "claim",
    seq: 0,
    prev: GENESIS_PREV,
    at: "",
    launch: RULES.launch,
    author: vault.identity,
    epoch,
    btcBlockHash: BLOCK,
    nonce: "0",
    clz: 0,
    amount: "0",
    ticket,
    ticketSats,
  });
  const { nonce, clz } = mine(challenge, RULES.minClz);
  return signClaim(vault, ledger, RULES, {
    epoch,
    btcBlockHash: BLOCK,
    nonce,
    clz,
    ticket,
    ticketSats,
  });
}

describe("allocate", () => {
  it("gives the first claim the epoch budget and sets the ratio", () => {
    expect(allocate(1000n, 0n, 0, 500)).toEqual({ amount: 1000n, boundBy: "bootstrap" });
  });

  it("caps minting at the backing the ticket actually added", () => {
    // supply 1000 backed by 100 sats; 10 more sats may mint at most 100.
    expect(allocate(10_000n, 1000n, 100, 10)).toEqual({ amount: 100n, boundBy: "backing" });
  });

  it("never exceeds the epoch budget even when backing allows more", () => {
    expect(allocate(50n, 1000n, 100, 10_000)).toEqual({ amount: 50n, boundBy: "budget" });
  });

  it("does not let the backing ratio fall", () => {
    let supply = 1000n;
    let reserve = 100;
    let ratio = reserve / Number(supply);
    for (const ticket of [10, 3, 77, 1, 250]) {
      const { amount } = allocate(10n ** 12n, supply, reserve, ticket);
      supply += amount;
      reserve += ticket;
      const next = reserve / Number(supply);
      expect(next).toBeGreaterThanOrEqual(ratio - 1e-12);
      ratio = next;
    }
  });

  it("mints nothing once the epoch budget is spent", () => {
    expect(allocate(0n, 1000n, 100, 10_000).amount).toBe(0n);
  });
});

describe("replay", () => {
  it("accepts an empty chain", () => {
    const state = replay([], RULES);
    expect(state.supply).toBe(0n);
    expect(state.head).toBe(GENESIS_PREV);
    expect(state.length).toBe(0);
  });

  it("credits a valid claim and records its reserve contribution", async () => {
    const alice = testVault(1);
    const ledger = new MemoryLedger(RULES);
    const state = ledger.append(await claimFor(alice, ledger, 0, TICKET(1)));

    expect(state.supply).toBe(epochBudget(RULES, 0));
    expect(state.balances.get(alice.identity)).toBe(state.supply);
    expect(state.reserveSats).toBe(RULES.ticketSats);
    expect(state.spentTickets.has(TICKET(1))).toBe(true);
  });

  it("rejects a claim whose nonce does not produce the stated work", async () => {
    const alice = testVault(1);
    const ledger = new MemoryLedger(RULES);
    const record = await claimFor(alice, ledger, 0, TICKET(1));
    // Re-sign an altered body so the signature itself stays valid.
    const body = { ...record.body, clz: 99 } as typeof record.body;
    const forged = await alice.use((key) => ({
      body,
      signature: bytesToHex(signDigest(key, recordDigest(body))),
    }));
    expect(() => replay([forged], RULES)).toThrow(/zero bits/);
  });

  it("rejects a claim that mints more than the rule allows", async () => {
    const alice = testVault(1);
    const ledger = new MemoryLedger(RULES);
    const record = await claimFor(alice, ledger, 0, TICKET(1));
    const body = { ...record.body, amount: (BigInt(record.body.amount) + 1n).toString() };
    const forged = await alice.use((key) => ({
      body,
      signature: bytesToHex(signDigest(key, recordDigest(body))),
    }));
    expect(() => replay([forged], RULES)).toThrow(/the rule allows/);
  });

  it("rejects a ticket used twice", async () => {
    const alice = testVault(1);
    const ledger = new MemoryLedger(RULES);
    ledger.append(await claimFor(alice, ledger, 0, TICKET(1)));
    await expect(claimFor(alice, ledger, 1, TICKET(1))).rejects.toThrow(/already been used/);
  });

  it("rejects an underpaid ticket", async () => {
    const alice = testVault(1);
    const ledger = new MemoryLedger(RULES);
    const record = await claimFor(alice, ledger, 0, TICKET(1), RULES.ticketSats - 1);
    expect(() => replay([record], RULES)).toThrow(/sat ticket/);
  });

  it("rejects a record signed by someone else", async () => {
    const alice = testVault(1);
    const mallory = testVault(2);
    const ledger = new MemoryLedger(RULES);
    const record = await claimFor(alice, ledger, 0, TICKET(1));
    const forged = await mallory.use((key) => ({
      body: record.body,
      signature: bytesToHex(signDigest(key, recordDigest(record.body))),
    }));
    expect(() => replay([forged], RULES)).toThrow(/not signed by its stated author/);
  });

  it("rejects a broken chain link", async () => {
    const alice = testVault(1);
    const ledger = new MemoryLedger(RULES);
    const first = await claimFor(alice, ledger, 0, TICKET(1));
    ledger.append(first);
    const second = await claimFor(alice, ledger, 1, TICKET(2));
    const body = { ...second.body, prev: "b".repeat(64) };
    const forged = await alice.use((key) => ({
      body,
      signature: bytesToHex(signDigest(key, recordDigest(body))),
    }));
    expect(() => replay([first, forged], RULES)).toThrow(/does not chain/);
  });

  it("advances the head with every record", async () => {
    const alice = testVault(1);
    const ledger = new MemoryLedger(RULES);
    const first = await claimFor(alice, ledger, 0, TICKET(1));
    const state = ledger.append(first);
    expect(state.head).toBe(recordId(first.body));
  });
});

describe("transfers", () => {
  it("moves atoms between identities", async () => {
    const alice = testVault(1);
    const bob = testVault(2);
    const ledger = new MemoryLedger(RULES);
    const minted = ledger.append(await claimFor(alice, ledger, 0, TICKET(1))).supply;

    const amount = minted / 4n;
    const state = ledger.append(
      await signTransfer(alice, ledger, RULES, { to: bob.identity, amount, memo: "hi" }),
    );

    expect(state.balances.get(bob.identity)).toBe(amount);
    expect(state.balances.get(alice.identity)).toBe(minted - amount);
    expect(state.supply).toBe(minted);
  });

  it("refuses to spend more than the sender holds", async () => {
    const alice = testVault(1);
    const bob = testVault(2);
    const ledger = new MemoryLedger(RULES);
    const minted = ledger.append(await claimFor(alice, ledger, 0, TICKET(1))).supply;
    await expect(
      signTransfer(alice, ledger, RULES, { to: bob.identity, amount: minted + 1n }),
    ).rejects.toThrow(LedgerError);
  });

  it("rejects a forged over-spend at replay", async () => {
    const alice = testVault(1);
    const bob = testVault(2);
    const ledger = new MemoryLedger(RULES);
    const claim = await claimFor(alice, ledger, 0, TICKET(1));
    const minted = ledger.append(claim).supply;
    const transfer = await signTransfer(alice, ledger, RULES, { to: bob.identity, amount: 1n });
    const body = { ...transfer.body, amount: (minted * 2n).toString() };
    const forged = await alice.use((key) => ({
      body,
      signature: bytesToHex(signDigest(key, recordDigest(body))),
    }));
    expect(() => replay([claim, forged], RULES)).toThrow(/against a balance of/);
  });

  it("conserves supply across a chain of transfers", async () => {
    const alice = testVault(1);
    const bob = testVault(2);
    const ledger = new MemoryLedger(RULES);
    const minted = ledger.append(await claimFor(alice, ledger, 0, TICKET(1))).supply;

    ledger.append(await signTransfer(alice, ledger, RULES, { to: bob.identity, amount: 300n }));
    ledger.append(await signTransfer(bob, ledger, RULES, { to: alice.identity, amount: 100n }));
    const state = ledger.state();

    const total = [...state.balances.values()].reduce((a, b) => a + b, 0n);
    expect(total).toBe(minted);
    expect(state.balances.get(bob.identity)).toBe(200n);
  });
});

/* AUD-09: the parser used to fall through `if claim / else transfer`, so a
 * correctly signed record of any other kind moved tokens as a transfer. */
describe("decoding untrusted records", () => {
  const alice = testVault(1);
  const bob = testVault(2);

  /** Sign an arbitrary body, so only the decoder can be what rejects it. */
  async function signed(body: unknown): Promise<SignedRecord> {
    return alice.use((key) => ({
      body: body as SignedRecord["body"],
      signature: bytesToHex(signDigest(key, recordDigest(body as SignedRecord["body"]))),
    }));
  }

  const transfer = {
    kind: "transfer",
    seq: 0,
    prev: GENESIS_PREV,
    at: "2026-09-23T00:00:00.000Z",
    launch: RULES.launch,
    author: alice.identity,
    to: bob.identity,
    amount: "1",
  };

  it("refuses a kind it does not implement", async () => {
    const record = await signed({ ...transfer, kind: "not-a-transfer" });
    expect(() => replay([record], RULES)).toThrow(/unknown kind/);
    expect(() => decodeRecord(record)).toThrow(LedgerError);
  });

  it("refuses fields the canonical encoder never signs", async () => {
    // An extra key rides inside a valid signature without being covered by it.
    const record = await signed({ ...transfer, backdoor: "yes" });
    expect(() => replay([record], RULES)).toThrow(/unsigned fields: backdoor/);
  });

  it("refuses a nonce outside the 64-bit field", async () => {
    const record = await signed({
      kind: "claim",
      seq: 0,
      prev: GENESIS_PREV,
      at: "2026-09-23T00:00:00.000Z",
      launch: RULES.launch,
      author: alice.identity,
      epoch: 0,
      btcBlockHash: BLOCK,
      nonce: (1n << 64n).toString(),
      clz: 8,
      amount: "1",
      ticket: TICKET(1),
      ticketSats: RULES.ticketSats,
    });
    expect(() => replay([record], RULES)).toThrow(/outside the 64-bit field/);
  });

  it("names every malformed field rather than the first type error", async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ ...transfer, to: "nope" }, /recipient key/],
      [{ ...transfer, author: "nope" }, /author key/],
      [{ ...transfer, amount: "-1" }, /amount/],
      [{ ...transfer, amount: "01" }, /amount/],
      [{ ...transfer, seq: 1.5 }, /sequence number/],
      [{ ...transfer, prev: "zz" }, /previous digest/],
      [{ ...transfer, at: "" }, /timestamp/],
      [{ ...transfer, launch: "" }, /launch id/],
      [{ ...transfer, memo: "x".repeat(121) }, /memo/],
    ];
    for (const [body, pattern] of cases) {
      const record = await signed(body);
      expect(() => decodeRecord(record)).toThrow(pattern);
    }
  });

  it("refuses anything that is not a signed record at all", () => {
    expect(() => decodeRecord(null)).toThrow(/not an object/);
    expect(() => decodeRecord({ body: {} })).toThrow(/malformed signature/);
    expect(() => decodeChain({})).toThrow(/not an array/);
  });

  it("round-trips a record it accepts", async () => {
    const ledger = new MemoryLedger(RULES);
    const claim = await claimFor(alice, ledger, 0, TICKET(1));
    expect(decodeRecord(claim)).toEqual(claim);
  });
});

/* AUD-10: `signClaim` refused to author a zero-allocation claim, but `replay`
 * accepted one — so the author and the verifier disagreed about validity while
 * the ticket still raised the declared backing. */
describe("an exhausted epoch", () => {
  it("is refused by the verifier, not only by the author", async () => {
    const alice = testVault(1);
    const ledger = new MemoryLedger(RULES);
    const first = await claimFor(alice, ledger, 0, TICKET(1));
    ledger.append(first);

    // Hand-build the second claim for the same epoch: the allocation is now 0,
    // which is exactly what the author refuses to sign.
    const draft = {
      kind: "claim" as const,
      seq: 1,
      prev: recordId(first.body),
      at: "2026-09-23T00:00:00.000Z",
      launch: RULES.launch,
      author: alice.identity,
      epoch: 0,
      btcBlockHash: BLOCK,
      nonce: "0",
      clz: 0,
      amount: "0",
      ticket: TICKET(2),
      ticketSats: RULES.ticketSats,
    };
    const { nonce, clz } = mine(claimChallenge(RULES, draft), RULES.minClz);
    const body = { ...draft, nonce: nonce.toString(), clz };
    const forged = await alice.use((key) => ({
      body,
      signature: bytesToHex(signDigest(key, recordDigest(body))),
    }));

    expect(() => replay([first, forged], RULES)).toThrow(/allowance is exhausted/);
    await expect(claimFor(alice, ledger, 0, TICKET(2))).rejects.toThrow(/nothing left to mint/);
  });
});
