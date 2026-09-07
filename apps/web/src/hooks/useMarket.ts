/* React binding for one launch's offer book.
 *
 * Offer status depends on three things that live apart: the book (offers and
 * fills), the chain tip (expiry) and the ledger (whether the maker's transfer
 * landed). Joining them in one place keeps every consumer from re-deriving the
 * same status and reaching a different answer.
 */

import { useCallback, useMemo, useState } from "react";

import {
  MarketError,
  OfferBook,
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
}

export function useMarket({ launch, decimals, tipHeight, records }: MarketInputs): UseMarket {
  const book = useMemo(() => new OfferBook(launch), [launch]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => setRevision((r) => r + 1), []);

  const offers = useMemo(() => {
    const open = book.offers();
    const fills = book.fills();
    // Settlement is a join across the offer, its payment and the delivering
    // record — never a memo on its own. `settlementsIn` is where that join
    // lives, so the market page and anything else asking agree (AUD-11).
    const settled = settlementsIn(records, open, fills);
    return open
      .map((signed) => viewOffer(signed, { launch, decimals, tipHeight, fills, settled }))
      .sort((a, b) => a.unitPrice - b.unitPrice);
    // `revision` is the invalidation signal for the storage-backed book.
  }, [book, launch, decimals, tipHeight, records, revision]);

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
