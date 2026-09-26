import { describe, expect, it } from "vitest";

import { activityId, faultIn } from "@/domain/activity";
import { signActivity, type ActivityDraft } from "@/domain/activity";
import type { SignedActivity } from "@/domain/activity";
import { deriveKey, identityOf } from "@/domain/bitcoin";
import type { Vault } from "@/adapters/vault";
import { TESTNET3 } from "@/domain/bitcoin";
import { bidDraft, cancelDraft, composeBid, readBid, readiness, type Bid } from "./bid";

const alice = deriveKey(new Uint8Array(32).fill(3), TESTNET3);
const bob = deriveKey(new Uint8Array(32).fill(4), TESTNET3);

/** A wallet over a fixed key, as the vault presents one to signing code. */
function vaultOf(key: typeof alice): Vault {
  return { kind: "local", address: key.address, identity: identityOf(key), label: "test", use: async (fn) => fn(key) };
}

const terms = { launchId: "mesh-0000000000000000", tokenId: "0x" + "ee".repeat(32), amount: 100_00000000n, priceSats: 20_000 };

async function signed(key: typeof alice, draft: ActivityDraft): Promise<SignedActivity> {
  return signActivity(vaultOf(key), draft);
}

describe("bid", () => {
  it("round-trips through a signed event the index accepts", async () => {
    const bid = composeBid(terms, alice.address);
    const event = await signed(alice, bidDraft(bid));
    expect(faultIn(event)).toBeNull();
    expect(readBid(event, TESTNET3)).toEqual({ bid });
    expect(event.body.amount).toBe("10000000000");
    expect(event.body.sats).toBe(20_000);
  });

  it("refuses terms no listing could meet", () => {
    expect(() => composeBid({ ...terms, amount: 0n }, alice.address)).toThrow(/positive/);
    expect(() => composeBid({ ...terms, priceSats: 100 }, alice.address)).toThrow(/dust/);
    expect(() => composeBid({ ...terms, priceSats: 1.5 }, alice.address)).toThrow(/dust/);
  });

  it("is rejected when it names someone else's address", async () => {
    const bid = composeBid(terms, bob.address);
    const event = await signed(alice, bidDraft(bid));
    expect(readBid(event, TESTNET3)).toEqual({ fault: expect.stringMatching(/does not control/) });
  });

  it("is rejected when its event and its terms disagree", async () => {
    const bid = composeBid(terms, alice.address);
    const draft = bidDraft(bid);
    const cheaper = await signed(alice, { ...draft, sats: 10_000 });
    expect(readBid(cheaper, TESTNET3)).toEqual({ fault: expect.stringMatching(/price differs/) });
    const bigger = await signed(alice, { ...draft, amount: 1n });
    expect(readBid(bigger, TESTNET3)).toEqual({ fault: expect.stringMatching(/amount differs/) });
    const elsewhere: Bid = { ...bid, launchId: "other-0000000000000000" };
    const meta = JSON.stringify(elsewhere);
    const moved = await signed(alice, { ...draft, meta });
    expect(readBid(moved, TESTNET3)).toEqual({ fault: expect.stringMatching(/reference/) });
  });

  it("is rejected once altered in transit, as a hostile index might", async () => {
    const event = await signed(alice, bidDraft(composeBid(terms, alice.address)));
    const tampered = { ...event, body: { ...event.body, meta: event.body.meta!.replace("20000", "2000") } };
    expect(readBid(tampered, TESTNET3)).toEqual({ fault: expect.stringMatching(/Signature/) });
  });

  it("is withdrawn by an event that names it and carries no payload", async () => {
    const event = await signed(alice, bidDraft(composeBid(terms, alice.address)));
    const cancel = await signed(alice, cancelDraft(terms.launchId, activityId(event.body)));
    expect(faultIn(cancel)).toBeNull();
    expect(cancel.body.kind).toBe("cancel");
    expect(cancel.body.ref).toBe(activityId(event.body));
    const withPayload = await signed(alice, { ...cancelDraft(terms.launchId, activityId(event.body)), meta: "{}" });
    expect(faultIn(withPayload)).toMatch(/payload/);
  });
});

describe("readiness to meet a bid", () => {
  const cell = (amount: bigint) => ({ amount });

  it("lists a cell of exactly the amount as it is", () => {
    const exact = cell(100n);
    expect(readiness([cell(300n), exact], 100n)).toEqual({ kind: "ready", cell: exact });
  });

  it("sets the amount aside from the fewest cells, largest first", () => {
    expect(readiness([cell(30n), cell(80n), cell(50n)], 100n)).toEqual({ kind: "set-aside", from: [cell(80n), cell(50n)] });
    expect(readiness([cell(300n)], 100n)).toEqual({ kind: "set-aside", from: [cell(300n)] });
  });

  it("says how much is held when it is not enough", () => {
    expect(readiness([cell(30n), cell(20n)], 100n)).toEqual({ kind: "short", held: 50n });
    expect(readiness([], 1n)).toEqual({ kind: "short", held: 0n });
  });
});
