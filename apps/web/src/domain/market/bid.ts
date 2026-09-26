/* Bids: a buyer's signed intention, never a commitment of funds.
 *
 * A resting order that executes by itself is not possible here without a
 * custodian. An RGB++ sale is one Bitcoin transaction whose commitment names
 * the seller's cell, so it can only be finished by someone who knows that
 * cell — after the seller has chosen it. A bid therefore locks nothing. It
 * says "I would pay this much for this many", signed by the bidder's identity
 * like any other activity event, and it becomes a trade in two further steps:
 * a holder signs an ordinary listing for exactly those terms (`sale.ts`), and
 * the bidder completes that listing as any buyer would. Either side can walk
 * away until the last step, and the interface says so.
 *
 * The bid payload is the event's inline `meta`; the event's own `amount` and
 * `sats` restate it so the index's columns and the feed agree with the terms.
 * `readBid` holds every rule that makes the two consistent, and is the one
 * check a bid passes before anyone is shown it.
 */

import { addressOfIdentity } from "@/domain/bitcoin";
import { ACTIVE, DUST_SATS, type NetworkConfig } from "@/domain/bitcoin";
import type { ActivityDraft } from "@/domain/activity";
import type { SignedActivity } from "@/domain/activity";
import { faultIn, payloadRef } from "@/domain/activity";

export const BID_VERSION = "btcfun/bid/1";

export interface Bid {
  v: typeof BID_VERSION;
  launchId: string;
  tokenId: string;
  /** Atoms wanted, decimal. A listing meets the bid only for exactly this amount. */
  amount: string;
  /** Total price offered for `amount`, in sats. */
  priceSats: number;
  /** Where the bidder receives: the address of the key that signs the bid. */
  bidder: string;
}

/** Compose a bid, refusing terms no listing could meet. */
export function composeBid(
  terms: { launchId: string; tokenId: string; amount: bigint; priceSats: number },
  bidder: string,
): Bid {
  if (terms.amount <= 0n) throw new RangeError("a bid asks for a positive amount");
  // A listing's price output must clear dust, so a lower bid could never be met.
  if (!Number.isInteger(terms.priceSats) || terms.priceSats < DUST_SATS) {
    throw new RangeError(`a bid offers at least ${DUST_SATS} sats, the dust limit`);
  }
  return {
    v: BID_VERSION,
    launchId: terms.launchId,
    tokenId: terms.tokenId,
    amount: terms.amount.toString(),
    priceSats: terms.priceSats,
    bidder,
  };
}

/** The activity event that publishes `bid`. */
export function bidDraft(bid: Bid): ActivityDraft {
  const meta = JSON.stringify(bid);
  return { kind: "bid", launch: bid.launchId, amount: BigInt(bid.amount), sats: bid.priceSats, ref: payloadRef(meta), meta };
}

/** The activity event that withdraws the bid published as `bidId`. */
export function cancelDraft(launchId: string, bidId: string): ActivityDraft {
  return { kind: "cancel", launch: launchId, ref: bidId };
}

/** The bid `signed` carries, or why it is not an acceptable one. */
export function readBid(signed: SignedActivity, network: NetworkConfig = ACTIVE): { bid: Bid } | { fault: string } {
  const fault = faultIn(signed);
  if (fault) return { fault };
  const { body } = signed;
  if (body.kind !== "bid" || body.meta === undefined) return { fault: "Not a bid." };
  if (body.ref !== payloadRef(body.meta)) return { fault: "The bid's reference is not the digest of its terms." };
  let bid: Bid;
  try {
    bid = JSON.parse(body.meta) as Bid;
  } catch {
    return { fault: "The bid's terms do not parse." };
  }
  if (bid?.v !== BID_VERSION) return { fault: "Unknown bid version." };
  if (bid.launchId !== body.launch) return { fault: "The bid names a different launch from its event." };
  if (typeof bid.tokenId !== "string" || !/^0x[0-9a-f]{64}$/.test(bid.tokenId)) return { fault: "Malformed token id." };
  if (typeof bid.amount !== "string" || !/^[1-9][0-9]*$/.test(bid.amount)) return { fault: "A bid asks for a positive amount." };
  if (bid.amount !== body.amount) return { fault: "The bid's amount differs from its event's." };
  if (!Number.isInteger(bid.priceSats) || bid.priceSats < DUST_SATS) return { fault: "A bid offers at least the dust limit." };
  if (bid.priceSats !== body.sats) return { fault: "The bid's price differs from its event's." };
  // Otherwise anyone could bid on another person's behalf, and a seller who
  // met it would be listing for someone who never asked.
  if (addressOfIdentity(body.actor, network) !== bid.bidder) return { fault: "The bid receives at an address its signer does not control." };
  return { bid };
}

/** What a holder must do before they can sign a listing that meets a bid. */
export type Readiness<C> =
  /** A cell holds exactly the amount: list it. */
  | { kind: "ready"; cell: C }
  /** These cells cover it together: move the amount into a cell of its own first. */
  | { kind: "set-aside"; from: C[] }
  /** Not enough is held. */
  | { kind: "short"; held: bigint };

/**
 * How `cells` can meet a bid for `amount`. A listing sells one whole cell, so
 * only an exact cell is ready; otherwise the fewest cells that cover the
 * amount, largest first, since each input a transfer spends costs fee.
 */
export function readiness<C extends { amount: bigint }>(cells: readonly C[], amount: bigint): Readiness<C> {
  const exact = cells.find((c) => c.amount === amount);
  if (exact) return { kind: "ready", cell: exact };
  const from: C[] = [];
  let held = 0n;
  for (const cell of [...cells].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))) {
    if (held >= amount) break;
    from.push(cell);
    held += cell.amount;
  }
  return held >= amount ? { kind: "set-aside", from } : { kind: "short", held };
}
