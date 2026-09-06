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
  offerId,
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

  /**
   * Offer ids whose transfer is already on the ledger.
   *
   * A transfer's memo carries the offer id, which is what lets a maker prove
   * they settled without a receipt from anyone. Ids are matched by prefix
   * because the memo is capped at 120 characters.
   */
  const settled = useMemo(() => {
    const ids = new Set<string>();
    for (const record of records) {
      if (record.body.kind !== "transfer") continue;
      const memo = record.body.memo ?? "";
      const match = /^offer:([0-9a-f]{16,64})$/.exec(memo);
      if (match) ids.add(match[1]);
    }
    return ids;
  }, [records]);

  const offers = useMemo(() => {
    const fills = book.fills();
    // `settled` holds id prefixes from memos; expand to full ids present here.
    const settledFull = new Set<string>();
    for (const signed of book.offers()) {
      const id = offerId(signed.offer);
      for (const prefix of settled) if (id.startsWith(prefix)) settledFull.add(id);
    }
    return book
      .offers()
      .map((signed) => viewOffer(signed, { launch, decimals, tipHeight, fills, settled: settledFull }))
      .sort((a, b) => a.unitPrice - b.unitPrice);
    // `revision` is the invalidation signal for the storage-backed book.
  }, [book, launch, decimals, tipHeight, settled, revision]);

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

/** The memo a maker puts on the settling transfer, so anyone can match it. */
export function settlementMemo(id: string): string {
  return `offer:${id.slice(0, 32)}`;
}
