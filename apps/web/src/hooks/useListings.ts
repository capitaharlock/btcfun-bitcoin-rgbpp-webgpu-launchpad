/* Open listings, each checked against the chain before it is shown.
 *
 * A listing arrives from the index as a signed `offer` event, which proves
 * only that its seller said it. It is shown as buyable when all of this holds:
 *
 *   - the PSBT says what the listing says (`checkListing`);
 *   - the seller's address is the one the event's signing key controls;
 *   - the listed cell is live on CKB, sealed to the listed output, of this
 *     launch's token, holding the listed amount;
 *   - that output is unspent on Bitcoin.
 *
 * A listing whose cell or seal has moved is sold or cancelled; it is dropped
 * rather than shown as a stale price.
 */

import { useCallback, useEffect, useState } from "react";
import { ccc } from "@ckb-ccc/core";
import { p2wpkh } from "@scure/btc-signer";

import type { Launch } from "../data/launches";
import { feed, faultIn, type ActivityEntry } from "../lib/activity";
import { ACTIVE } from "../lib/bitcoin/network";
import { isSpent } from "../lib/bitcoin";
import { hexToBytes } from "../lib/bytes";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { mintScript, tokenScript } from "../lib/rgbpp/launch";
import { decodeAmount, type TokenCell } from "../lib/rgbpp/operations";
import { checkListing, type Listing } from "../lib/rgbpp/sale";
import { rgbppLock } from "../lib/rgbpp/seal";

const POLL_MS = 30_000;

export interface OpenListing {
  listing: Listing;
  /** The live cell, as read from CKB. */
  cell: TokenCell;
  launch: Launch;
  /** Identity that signed the listing. */
  seller: string;
  at: string;
}

let client: ccc.Client | null = null;
function ckb(): ccc.Client {
  client ??= new ccc.ClientPublicTestnet();
  return client;
}

async function verified(entry: ActivityEntry, launches: Map<string, Launch>): Promise<OpenListing | null> {
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
  if (p2wpkh(hexToBytes(body.actor), ACTIVE.params).address !== listing.seller) return null;

  const token = tokenScript(ACTIVE_RGBPP, mintScript(ACTIVE_RGBPP, launch.terms));
  const live = await ckb().getCellLive(listing.outPoint, true);
  if (!live || !live.cellOutput.type?.eq(token)) return null;
  if (!live.cellOutput.lock.eq(rgbppLock(ACTIVE_RGBPP, listing.seal))) return null;
  const amount = decodeAmount(live.outputData);
  if (amount.toString() !== listing.amount) return null;
  if (await isSpent(listing.seal.txid, listing.seal.vout)) return null;

  return {
    listing,
    cell: { outPoint: listing.outPoint, capacity: live.cellOutput.capacity, seal: listing.seal, amount },
    launch,
    seller: body.actor,
    at: body.at,
  };
}

export function useListings(launches: Launch[]): { listings: OpenListing[]; loading: boolean; reload: () => void } {
  const [listings, setListings] = useState<OpenListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => setRevision((r) => r + 1), []);

  useEffect(() => {
    let live = true;
    const byId = new Map(launches.map((l) => [l.id, l]));
    const read = async () => {
      try {
        const { entries } = await feed({ kind: "offer", limit: 100 });
        const checked = await Promise.all(entries.map((e) => verified(e, byId).catch(() => null)));
        // One cell can be listed only once at a time; keep the newest listing for it.
        const byCell = new Map<string, OpenListing>();
        for (const item of checked) {
          if (!item) continue;
          const key = `${item.listing.outPoint.txHash}:${item.listing.outPoint.index}`;
          const prior = byCell.get(key);
          if (!prior || prior.at < item.at) byCell.set(key, item);
        }
        if (live) setListings([...byCell.values()].sort((a, b) => a.listing.priceSats / Number(a.listing.amount) - b.listing.priceSats / Number(b.listing.amount)));
      } finally {
        if (live) setLoading(false);
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [launches, revision]);

  return { listings, loading, reload };
}
