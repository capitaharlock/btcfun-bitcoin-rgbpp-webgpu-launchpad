/* The market: an order book between people, one token at a time.
 *
 * Asks are listings — seller-signed halves of a Bitcoin transaction that a
 * buyer completes alone (`lib/rgbpp/sale.ts`). Bids are signed intentions
 * that lock nothing (`lib/market/bid.ts`); a holder meets one by signing a
 * listing for its exact terms, and the bidder completes it. Nobody holds
 * anything in between — not the seller's tokens, not the buyer's money, not
 * this app — and there is no pool or market maker: every price on this page
 * is one a person signed.
 */

import { useMemo, useState } from "react";

import { Bids } from "../components/market/Bids";
import { Listings } from "../components/market/Listings";
import { MyOrders } from "../components/market/MyOrders";
import { OrderBook } from "../components/market/OrderBook";
import { Sell } from "../components/market/Sell";
import { Trades } from "../components/market/Trades";
import type { Launch } from "../data/launches";
import { useLaunches } from "../hooks/useLaunches";
import { asOrder, useMarket, type OpenListing, type PublishedBid } from "../hooks/useMarket";
import { useMarketActions } from "../hooks/useMarketActions";
import { txUrl } from "../lib/bitcoin/network";
import { atoms, group, satsPerToken } from "../lib/format";
import { buildBook, compareRate, unitPrice, type Order } from "../lib/market/book";
import type { Seal } from "../lib/rgbpp/seal";
import { DECIMALS } from "../lib/standard";
import { useTokens, type Operation } from "../state/TokensProvider";
import { useWallet } from "../state/WalletProvider";
import { Chip, Field, Notice, PageHead, Panel, Stat } from "../ui/primitives";
import { Sigil } from "../ui/Sigil";

const bidOrder = ({ bid }: PublishedBid): Order => ({ priceSats: bid.priceSats, amount: BigInt(bid.amount) });
const sealKey = (seal: Seal) => `${seal.txid}:${seal.vout}`;

/** The token to open on: one with orders, else one this wallet holds, else the first. */
function defaultToken(launches: Launch[], listings: OpenListing[], bids: PublishedBid[], held: Iterable<string>): string | null {
  const active = new Set([...listings.map((l) => l.launch.tokenId), ...bids.map((b) => b.launch.tokenId)]);
  const holding = new Set(held);
  return (launches.find((l) => active.has(l.tokenId)) ?? launches.find((l) => holding.has(l.tokenId)) ?? launches[0])?.tokenId ?? null;
}

export function Market() {
  const launches = useLaunches();
  const market = useMarket(launches);
  const actions = useMarketActions();
  const tokens = useTokens();
  const me = useWallet().vault?.identity ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  // A bought or cancelled listing leaves the table at once, since it is no
  // longer open; this is where the person sees what they just did.
  const [lastOp, setLastOp] = useState<Operation | null>(null);
  const done = (op: Operation) => {
    setLastOp(op);
    market.reload();
  };

  const liveBids = useMemo(
    () => market.bids.filter((b) => b.status.state === "open" || b.status.state === "accepted"),
    [market.bids],
  );
  const tokenId = picked ?? defaultToken(launches, market.listings, liveBids, tokens.holdings?.tokens.keys() ?? []);
  const launch = launches.find((l) => l.tokenId === tokenId);

  const view = useMemo(() => {
    const asks = market.listings.filter((l) => l.launch.tokenId === tokenId);
    const bids = liveBids.filter((b) => b.launch.tokenId === tokenId).sort((a, b) => compareRate(bidOrder(b), bidOrder(a)));
    // A bid a holder has already met is represented by the listing signed for
    // it; counting both would show the same interest on each side of the book.
    const open = bids.filter((b) => b.status.state === "open");
    const listed = new Set(market.listings.filter((l) => l.seller === me).map((l) => sealKey(l.listing.seal)));
    return {
      asks,
      bids,
      book: buildBook(asks.map((a) => asOrder(a.listing)), open.map(bidOrder)),
      trades: market.trades.filter((t) => t.launchId === launch?.id),
      // Cells already listed are spoken for: listing one again would leave the
      // first signature valid at its old price.
      cells: (tokenId ? tokens.holdings?.tokens.get(tokenId) ?? [] : []).filter((c) => !listed.has(sealKey(c.seal))),
    };
  }, [market.listings, market.trades, liveBids, tokenId, launch, tokens.holdings, me]);

  const last = view.trades[0];
  const bestBid = view.book.bids[0];
  const bestAsk = view.book.asks[0];
  const launchOf = (id: string) => launches.find((l) => l.id === id);

  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="market"
        title={
          <>
            Buy and sell, <span className="hl violet">no middleman</span>
          </>
        }
        lede="Every price here is one a person signed. Nothing is escrowed."
        aside={<Chip tone="cyan">{market.listings.length} asks · {liveBids.length} bids</Chip>}
      />

      {lastOp && <OperationNotice op={lastOp} symbol={launchOf(lastOp.launchId)?.symbol ?? ""} />}

      {launch ? (
        <>
          <div className="ticker">
            <div className="row">
              <Sigil seed={launch.id} accent={launch.accent} size="md" />
              <div className="grow">
                <Field label="Token">
                  <select className="input" value={launch.tokenId} onChange={(e) => setPicked(e.target.value)}>
                    {launches.map((l) => (
                      <option key={l.tokenId} value={l.tokenId}>{l.symbol} · {l.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <Stat k="last trade" v={last ? satsPerToken(unitPrice(last)) : "—"} unit={last ? "sats" : undefined} tone="violet" />
            <Stat k="best bid · best ask" v={`${bestBid ? satsPerToken(bestBid.unitPrice) : "—"} · ${bestAsk ? satsPerToken(bestAsk.unitPrice) : "—"}`} small />
            <Stat
              k="spread"
              v={view.book.spread === null ? "—" : view.book.spread < 0 ? "crossed" : satsPerToken(view.book.spread)}
              unit={view.book.spread !== null && view.book.spread >= 0 ? "sats" : undefined}
              hint="Crossed means a bid pays more than an ask: the bidder can simply buy that ask."
              small
            />
          </div>

          <section className="split">
            <OrderBook book={view.book} symbol={launch.symbol} />
            <Trades trades={view.trades} symbol={launch.symbol} />
          </section>

          <Listings listings={view.asks} loading={market.loading} me={me} actions={actions} onDone={done} />
          <Bids launch={launch} bids={view.bids} me={me} cells={view.cells} actions={actions} onDone={done} onPublished={market.reload} />
        </>
      ) : (
        <Panel eyebrow="order book" title="No tokens yet">
          <p className="clamp">No launch is known to this browser or the index. <a href="#/create">Create the first one</a>.</p>
        </Panel>
      )}

      {me !== null && (
        <MyOrders
          listings={market.listings.filter((l) => l.seller === me)}
          bids={market.bids.filter((b) => b.bidder === me)}
          actions={actions}
          onDone={done}
          onPublished={market.reload}
        />
      )}

      <Sell launches={launches} actions={actions} onListed={market.reload} />
    </div>
  );
}

function OperationNotice({ op, symbol }: { op: Operation; symbol: string }) {
  const amount = `${atoms(BigInt(op.atoms ?? "0"), DECIMALS, 2)} ${symbol}`;
  const link = <a href={txUrl(op.btcTxid)} target="_blank" rel="noopener noreferrer">view the Bitcoin transaction</a>;
  switch (op.kind) {
    case "buy":
      return (
        <Notice tone="cyan">
          Bought {amount}{op.sats ? ` for ${group(op.sats)} sats` : ""} — {link}. The tokens settle to your address once it confirms.
        </Notice>
      );
    case "cancel":
      return (
        <Notice tone="cyan">
          Cancelled {amount} — {link}. The cell moves back to you once it confirms, which voids the listing.
        </Notice>
      );
    default:
      return (
        <Notice tone="cyan">
          Setting aside {amount} in a cell of its own — {link}. Once it settles, it can be sold whole.
        </Notice>
      );
  }
}
