/* Offer counts and floor prices across every launch.
 *
 * The launches grid needs to know which launches are tradable and at what
 * price, which is a read across every book at once — not something the
 * per-launch `useMarket` hook can answer without being called in a loop.
 * `OfferBook` is a plain class over storage, so reading them all is cheap and
 * needs no hook per launch.
 */

import { useMemo } from "react";

import { SPECS } from "../data/launches";
import { OfferBook, faultIn, offerId, unitPrice, type SignedOffer } from "../lib/market";

export interface OfferSummary {
  /** Offers that are signed, unexpired and unfilled. */
  open: number;
  /** Cheapest open offer in satoshis per whole token, or null when none. */
  floor: number | null;
}

/** Summaries keyed by launch id. Launches with no book are absent. */
export type OfferSummaries = ReadonlyMap<string, OfferSummary>;

export function useOfferSummaries(tipHeight: number, decimals = 8): OfferSummaries {
  return useMemo(() => {
    const summaries = new Map<string, OfferSummary>();

    for (const spec of SPECS) {
      const book = new OfferBook(spec.id);
      const fills = book.fills();
      let open = 0;
      let floor: number | null = null;

      for (const signed of book.offers()) {
        if (!isTradable(signed, spec.id, tipHeight, fills.has(offerId(signed.offer)))) continue;
        open++;
        const price = unitPrice(signed.offer, decimals);
        if (floor === null || price < floor) floor = price;
      }

      if (open > 0) summaries.set(spec.id, { open, floor });
    }

    return summaries;
  }, [tipHeight, decimals]);
}

function isTradable(
  signed: SignedOffer,
  launch: string,
  tipHeight: number,
  filled: boolean,
): boolean {
  if (filled) return false;
  if (signed.offer.expiresAt <= tipHeight) return false;
  return faultIn(signed, launch) === null;
}
