/* One token's book: bids best-first beside asks best-first, with depth.
 *
 * Levels come from `buildBook`, which merges only orders at exactly the same
 * rate. The bar behind each row is its cumulative size against the deeper of
 * the two sides, so the sides are drawn to one scale.
 */

import type { CSSProperties } from "react";

import type { Book, Level } from "../../lib/market/book";
import { atoms, group, satsPerToken } from "../../lib/format";
import { DECIMALS } from "../../lib/standard";
import { More, Panel } from "../../ui/primitives";
import "./market.css";

export function OrderBook({ book, symbol }: { book: Book; symbol: string }) {
  const deepest = [book.bids.at(-1)?.cumulative ?? 0n, book.asks.at(-1)?.cumulative ?? 0n].reduce((a, b) => (a > b ? a : b));

  return (
    <Panel eyebrow="order book" title={`${symbol} bids and asks`}>
      <div className="book">
        <Side side="bids" title="Bids · buying" levels={book.bids} deepest={deepest} empty="No bids." />
        <Side side="asks" title="Asks · selling" levels={book.asks} deepest={deepest} empty="No asks." />
      </div>
      <More>
        <p>
          Price per whole token in sats. Every order is all-or-nothing: a listing sells one whole cell, and a bid is met only
          by a listing of exactly its size. Depth is cumulative from the best price.
        </p>
      </More>
    </Panel>
  );
}

function Side({
  side,
  title,
  levels,
  deepest,
  empty,
}: {
  side: "bids" | "asks";
  title: string;
  levels: Level[];
  deepest: bigint;
  empty: string;
}) {
  return (
    <div className={side}>
      <div className="eyebrow side">{title}</div>
      {levels.length === 0 ? (
        <p className="faint tiny">{empty}</p>
      ) : (
        <table className="table" aria-label={title}>
          <thead>
            <tr>
              <th>price</th>
              <th>size</th>
              <th>depth</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level, i) => (
              <tr
                key={i}
                className="level"
                style={{ "--depth": `${deepest > 0n ? Number((level.cumulative * 1000n) / deepest) / 10 : 0}%` } as CSSProperties}
                title={`${level.orders} order${level.orders === 1 ? "" : "s"} · ${group(level.sats)} sats`}
              >
                <td className="px">{satsPerToken(level.unitPrice)}</td>
                <td className="mono">{atoms(level.amount, DECIMALS, 2)}</td>
                <td className="mono">{atoms(level.cumulative, DECIMALS, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
