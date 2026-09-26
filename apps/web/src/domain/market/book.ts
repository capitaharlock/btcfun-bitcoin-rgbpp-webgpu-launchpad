/* The order book: asks and bids for one token, aggregated by price.
 *
 * Every order here is all-or-nothing — a listing sells one whole cell, a bid
 * is met only by a listing of exactly its amount — so an order's price is a
 * pair (sats, atoms) rather than a rate. Orders are grouped into a level only
 * when their rates are exactly equal, compared by cross-multiplication in
 * integers; rounding the rate first would merge orders a buyer would pay
 * different amounts for. The rate is converted to a float only for display.
 */

import { DECIMALS } from "@/domain/protocol";

export interface Order {
  /** Total sats the order is priced at. */
  priceSats: number;
  /** Atoms it covers. */
  amount: bigint;
}

export interface Level {
  /** Sats per whole token, for display. */
  unitPrice: number;
  /** Atoms at this price. */
  amount: bigint;
  /** Sats at this price. */
  sats: number;
  /** Orders at this price. */
  orders: number;
  /** Atoms at this price and every better one: the depth a taker would sweep. */
  cumulative: bigint;
}

export interface Book {
  /** Highest rate first. */
  bids: Level[];
  /** Lowest rate first. */
  asks: Level[];
  /** Best ask minus best bid, per token; null unless both sides have orders. */
  spread: number | null;
}

const ONE = 10n ** BigInt(DECIMALS);

/** Sats per whole token. */
export function unitPrice(order: Order): number {
  return (order.priceSats * Number(ONE)) / Number(order.amount);
}

/** Sign of rate(a) − rate(b), exactly. */
export function compareRate(a: Order, b: Order): number {
  const left = BigInt(a.priceSats) * b.amount;
  const right = BigInt(b.priceSats) * a.amount;
  return left < right ? -1 : left > right ? 1 : 0;
}

function levels(orders: readonly Order[], direction: 1 | -1): Level[] {
  const sorted = orders.filter((o) => o.amount > 0n).sort((a, b) => direction * compareRate(a, b));
  const out: Level[] = [];
  let first: Order | null = null;
  let cumulative = 0n;
  for (const order of sorted) {
    cumulative += order.amount;
    const last = out[out.length - 1];
    if (first && last && compareRate(first, order) === 0) {
      last.amount += order.amount;
      last.sats += order.priceSats;
      last.orders += 1;
      last.cumulative = cumulative;
    } else {
      first = order;
      out.push({ unitPrice: unitPrice(order), amount: order.amount, sats: order.priceSats, orders: 1, cumulative });
    }
  }
  return out;
}

export function buildBook(asks: readonly Order[], bids: readonly Order[]): Book {
  const book = { asks: levels(asks, 1), bids: levels(bids, -1) };
  const bestAsk = book.asks[0];
  const bestBid = book.bids[0];
  return { ...book, spread: bestAsk && bestBid ? bestAsk.unitPrice - bestBid.unitPrice : null };
}
