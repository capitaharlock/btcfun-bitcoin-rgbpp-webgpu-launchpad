/* React binding for one launch's offer book.
 *
 * Offer status depends on four things that live apart: the book (offers and
 * the buyer's own fills), the chain tip (expiry), the ledger (whether the
 * maker's transfer landed) and the maker's address history (whether anyone
 * paid). Joining them in one place keeps every consumer from re-deriving the
 * same status and reaching a different answer.
 *
 * The last one is what lets a sale finish between two browsers. A buyer's fill
 * used to live only in the buyer's book, so the maker never learned they had
 * been paid and had no way to deliver. Now the maker's page reads payments to
 * its own address and recognises the ones that name its offers — the chain is
 * the channel, and nothing has to be handed back.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { getAddressTxs, type ChainTx } from "../lib/bitcoin";
import {
  MarketError,
  OfferBook,
  fillsIn,
  settlementsIn,
  viewOffer,
  type Fill,
  type OfferView,
  type SignedOffer,
} from "../lib/market";
import type { SignedRecord } from "../lib/ledger";

export interface UseMarket {
  book: OfferBook;
  /** Every offer in the book, with status resolved. */
  offers: OfferView[];
  error: string | null;
  add: (signed: SignedOffer) => boolean;
  importOffer: (json: string) => boolean;
  remove: (id: string) => void;
  recordFill: (fill: Fill) => boolean;
  reload: () => void;
}

export interface MarketInputs {
  launch: string;
  decimals: number;
  tipHeight: number;
  /** Ledger records, used to tell an awaiting offer from a settled one. */
  records: readonly SignedRecord[];
  /** The connected wallet, whose incoming payments settle its own offers. */
  maker?: { identity: string; address: string } | null;
}

/** How often a maker's page looks for payments to its offers. */
const PAYMENT_POLL_MS = 30_000;

export function useMarket({ launch, decimals, tipHeight, records, maker }: MarketInputs): UseMarket {
  const book = useMemo(() => new OfferBook(launch), [launch]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<ChainTx[]>([]);

  const makerIdentity = maker?.identity;
  const makerAddress = maker?.address;
  // Watch only while this wallet has an offer of its own to be paid for.
  const selling = useMemo(
    () => !!makerIdentity && book.offers().some((o) => o.offer.maker === makerIdentity),
    // `revision` is the invalidation signal for the storage-backed book.
    [book, makerIdentity, revision], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!selling || !makerAddress) {
      setIncoming([]);
      return;
    }
    let live = true;
    const poll = async () => {
      try {
        const txs = await getAddressTxs(makerAddress);
        if (live) setIncoming(txs);
      } catch {
        // A missed poll delays a status, it does not change one: the payment is
        // still on chain next time. Nothing to surface.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), PAYMENT_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selling, makerAddress]);

  const reload = useCallback(() => setRevision((r) => r + 1), []);

  const offers = useMemo(() => {
    const open = book.offers();
    // A buyer's own record of paying, then whatever the chain shows was paid
    // to this wallet. Both describe the same payment when both exist.
    const fills = new Map([...fillsIn(incoming, open), ...book.fills()]);
    // Settlement is a join across the offer, its payment and the delivering
    // record — never a memo on its own. `settlementsIn` is where that join
    // lives, so the market page and anything else asking agree.
    const settled = settlementsIn(records, open, fills);
    return open
      .map((signed) => viewOffer(signed, { launch, decimals, tipHeight, fills, settled }))
      .sort((a, b) => a.unitPrice - b.unitPrice);
    // `revision` is the invalidation signal for the storage-backed book.
  }, [book, launch, decimals, tipHeight, records, incoming, revision]);

  const attempt = useCallback(
    (action: () => void): boolean => {
      try {
        action();
        setError(null);
        reload();
        return true;
      } catch (err) {
        setError(err instanceof MarketError || err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [reload],
  );

  return {
    book,
    offers,
    error,
    add: (signed) => attempt(() => book.add(signed)),
    importOffer: (json) => attempt(() => void book.addFromJson(json)),
    remove: (id) => attempt(() => book.remove(id)),
    recordFill: (fill) => attempt(() => book.recordFill(fill)),
    reload,
  };
}
