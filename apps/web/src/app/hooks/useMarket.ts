/* The market as the index and the chains describe it: open listings, bids and
 * trades, each checked before it is shown.
 *
 * A listing arrives as a signed `offer` event, which proves only that its
 * seller said it. It is shown as buyable when all of this holds:
 *
 *   - the PSBT says what the listing says (`checkListing`);
 *   - the seller's address is the one the event's signing key controls;
 *   - the listed cell is live on CKB, sealed to the listed output, of this
 *     launch's token, holding the listed amount;
 *   - that output is unspent on Bitcoin.
 *
 * A listing whose cell or seal has moved is sold or cancelled; it is dropped
 * rather than shown as a stale price.
 *
 * A bid is shown when `readBid` accepts it; what became of it is derived by
 * `bidStatus` from the listings, trades and withdrawals around it. A trade is
 * shown only when its Bitcoin transaction is a sale of the listing it names
 * (`domain/market/trades.ts`) — the `fill` event that points at it is a hint
 * where to look, never the evidence.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { Launch } from "@/domain/launches";
import { feed } from "@/adapters/activity-index";
import { faultIn } from "@/domain/activity";
import type { ActivityEntry, ActivityKind } from "@/domain/activity";
import { addressOfIdentity } from "@/domain/bitcoin";
import { getTx, isSpent } from "@/adapters/mempool";
import type { ChainTx } from "@/domain/bitcoin";
import { readBid, type Bid } from "@/domain/market";
import { compareRate, type Order } from "@/domain/market";
import { bidStatus, tradeOf, type BidStatus, type Trade } from "@/domain/market";
import { ACTIVE_RGBPP } from "@/domain/rgbpp";
import { ckbClient } from "@/adapters/ckb";
import { mintScript, tokenScript } from "@/domain/rgbpp";
import { decodeAmount, type TokenCell } from "@/domain/rgbpp";
import { checkListing, type Listing } from "@/domain/rgbpp";
import { rgbppLock } from "@/domain/rgbpp";

const POLL_MS = 30_000;
/** Events read per kind. The index's own ceiling. */
const DEPTH = 200;

export interface OpenListing {
  listing: Listing;
  /** The live cell, as read from CKB. */
  cell: TokenCell;
  launch: Launch;
  /** Identity that signed the listing. */
  seller: string;
  /** Activity id of the offer event, which a purchase's `fill` points back to. */
  offerId: string;
  at: string;
}

export interface PublishedBid {
  /** Activity id of the bid event: how listings and withdrawals name it. */
  id: string;
  bid: Bid;
  launch: Launch;
  /** Identity that signed the bid. */
  bidder: string;
  at: string;
  status: BidStatus<OpenListing>;
}

export interface MarketTrade extends Trade {
  /** When the index first heard of it, unix seconds. Ordering only. */
  receivedAt: number;
}

export interface Market {
  listings: OpenListing[];
  bids: PublishedBid[];
  /** Newest first. */
  trades: MarketTrade[];
  loading: boolean;
  reload: () => void;
}

interface SignedListing {
  listing: Listing;
  launch: Launch;
  entry: ActivityEntry;
}

/** A listing whose signatures and terms agree, before any chain is asked. */
function signedListing(entry: ActivityEntry, launches: Map<string, Launch>): SignedListing | null {
  const { body } = entry.signed;
  if (body.kind !== "offer" || !body.meta || faultIn(entry.signed) !== null) return null;
  let listing: Listing;
  try {
    listing = JSON.parse(body.meta) as Listing;
  } catch {
    return null;
  }
  if (listing?.v !== "btcfun/listing/1" || listing.launchId !== body.launch) return null;
  const launch = launches.get(listing.launchId);
  if (!launch || launch.tokenId !== listing.tokenId) return null;
  if (checkListing(listing) !== null) return null;
  // The listing must pay the address of the key that signed it.
  if (addressOfIdentity(body.actor) !== listing.seller) return null;
  return { listing, launch, entry };
}

/** The listing, if its cell is still where it says and still for sale. */
async function live({ listing, launch, entry }: SignedListing): Promise<OpenListing | null> {
  const token = tokenScript(ACTIVE_RGBPP, mintScript(ACTIVE_RGBPP, launch.terms));
  const cell = await ckbClient().getCellLive(listing.outPoint, true);
  if (!cell || !cell.cellOutput.type?.eq(token)) return null;
  if (!cell.cellOutput.lock.eq(rgbppLock(ACTIVE_RGBPP, listing.seal))) return null;
  const amount = decodeAmount(cell.outputData);
  if (amount.toString() !== listing.amount) return null;
  if (await isSpent(listing.seal.txid, listing.seal.vout)) return null;

  return {
    listing,
    cell: { outPoint: listing.outPoint, capacity: cell.cellOutput.capacity, seal: listing.seal, amount },
    launch,
    seller: entry.signed.body.actor,
    offerId: entry.id,
    at: entry.signed.body.at,
  };
}

/** A listing as an order, for rate comparisons. */
export const asOrder = (l: Listing): Order => ({ priceSats: l.priceSats, amount: BigInt(l.amount) });

export function useMarket(launches: Launch[]): Market {
  const [state, setState] = useState<Omit<Market, "loading" | "reload">>({ listings: [], bids: [], trades: [] });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  // A confirmed transaction never changes, so it is fetched once per session.
  const settled = useRef(new Map<string, ChainTx>());

  const reload = useCallback(() => setRevision((r) => r + 1), []);

  useEffect(() => {
    let active = true;
    const byId = new Map(launches.map((l) => [l.id, l]));

    const transaction = async (txid: string): Promise<ChainTx> => {
      const known = settled.current.get(txid);
      if (known) return known;
      const tx = await getTx(txid);
      if (tx.confirmed) settled.current.set(txid, tx);
      return tx;
    };

    const read = async () => {
      try {
        const kinds: ActivityKind[] = ["offer", "bid", "cancel", "fill"];
        const [offers, bids, cancels, fills] = await Promise.all(kinds.map((kind) => feed({ kind, limit: DEPTH })));

        const signed = offers.entries.map((e) => signedListing(e, byId)).filter((s) => s !== null);
        const checked = await Promise.all(signed.map((s) => live(s).catch(() => null)));
        // One cell can be listed only once at a time; keep the newest listing for it.
        const byCell = new Map<string, OpenListing>();
        for (const item of checked) {
          if (!item) continue;
          const key = `${item.listing.outPoint.txHash}:${item.listing.outPoint.index}`;
          const prior = byCell.get(key);
          if (!prior || prior.at < item.at) byCell.set(key, item);
        }
        const listings = [...byCell.values()].sort((a, b) => compareRate(asOrder(a.listing), asOrder(b.listing)));

        const byOffer = new Map(signed.map((s) => [s.entry.id, s.listing]));
        const found = await Promise.all(
          fills.entries.map(async (entry): Promise<MarketTrade | null> => {
            const { txid, ref } = entry.signed.body;
            const listing = byOffer.get(ref);
            if (!txid || !listing || faultIn(entry.signed) !== null) return null;
            const tx = await transaction(txid).catch(() => null);
            const trade = tx && tradeOf(listing, tx);
            return trade ? { ...trade, receivedAt: entry.receivedAt } : null;
          }),
        );
        // Several people may report the same sale; it happened once.
        const byTx = new Map<string, MarketTrade>();
        for (const trade of found) if (trade && !byTx.has(trade.txid)) byTx.set(trade.txid, trade);
        const trades = [...byTx.values()].sort((a, b) => b.receivedAt - a.receivedAt);

        // Only its author can withdraw a bid.
        const withdrawn = new Set(
          cancels.entries.filter((e) => faultIn(e.signed) === null).map((e) => `${e.signed.body.actor}:${e.signed.body.ref}`),
        );
        const published = bids.entries.flatMap((entry): PublishedBid[] => {
          const parsed = readBid(entry.signed);
          if ("fault" in parsed) return [];
          const { bid } = parsed;
          const launch = byId.get(bid.launchId);
          if (!launch || launch.tokenId !== bid.tokenId) return [];
          const { actor, at } = entry.signed.body;
          const status = bidStatus(entry.id, bid, { listings, trades, cancelled: withdrawn.has(`${actor}:${entry.id}`) });
          return [{ id: entry.id, bid, launch, bidder: actor, at, status }];
        });

        if (active) setState({ listings, bids: published, trades });
      } finally {
        if (active) setLoading(false);
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [launches, revision]);

  return { ...state, loading, reload };
}
