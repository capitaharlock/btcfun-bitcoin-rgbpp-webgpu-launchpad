/* Bids for one token, how a holder meets one, and how to place one.
 *
 * A bid locks nothing (`lib/market/bid.ts`). Meeting it means signing an
 * ordinary listing for exactly its size and price, which the bidder then
 * completes like any purchase. A listing sells one whole cell, so a holder
 * without a cell of exactly that size first sets the amount aside in a cell
 * of its own — a transfer to themselves — and sells that.
 */

import { useState, type ReactNode } from "react";

import { useAction } from "../../hooks/useAction";
import type { PublishedBid } from "../../hooks/useMarket";
import type { MarketActions } from "../../hooks/useMarketActions";
import type { Launch } from "../../data/launches";
import { DUST_SATS } from "../../lib/bitcoin";
import { atoms, group, parseAmount, satsPerToken, shortHash } from "../../lib/format";
import { readiness } from "../../lib/market/bid";
import { unitPrice } from "../../lib/market/book";
import type { TokenCell } from "../../lib/rgbpp/operations";
import { DECIMALS } from "../../lib/standard";
import type { Operation } from "../../state/TokensProvider";
import { Chip, Field, More, Notice, Panel } from "../../ui/primitives";
import "./market.css";

interface Props {
  launch: Launch;
  /** Open and accepted bids for this token, best price first. */
  bids: PublishedBid[];
  me: string | null;
  /** This wallet's cells of this token that are not already listed. */
  cells: TokenCell[];
  actions: MarketActions;
  onDone: (op: Operation) => void;
  /** Something was published; read the market again. */
  onPublished: () => void;
}

export function Bids({ launch, bids, me, cells, actions, onDone, onPublished }: Props) {
  return (
    <Panel eyebrow="bids" title={`Sell ${launch.symbol} to a bid`}>
      {bids.length === 0 ? (
        <p className="faint clamp">No bids for {launch.symbol}.</p>
      ) : (
        <div className="scroll-x">
          <table className="table" aria-label="Bids">
            <thead>
              <tr>
                <th>per token</th>
                <th>size</th>
                <th>pays</th>
                <th>bidder</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bids.map((item) => (
                <BidRow key={item.id} item={item} me={me} cells={cells} actions={actions} onDone={onDone} onPublished={onPublished} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {me !== null && <PlaceBid launch={launch} actions={actions} onPublished={onPublished} />}
    </Panel>
  );
}

function BidRow({
  item,
  me,
  cells,
  actions,
  onDone,
  onPublished,
}: {
  item: PublishedBid;
  me: string | null;
  cells: TokenCell[];
  actions: MarketActions;
  onDone: (op: Operation) => void;
  onPublished: () => void;
}) {
  const { busy, error, run } = useAction();
  const { bid, launch, status } = item;
  const amount = BigInt(bid.amount);
  const size = atoms(amount, DECIMALS, 2);

  let action: ReactNode = null;
  if (item.bidder === me) {
    action = <Chip>yours</Chip>;
  } else if (status.state === "accepted") {
    action = <Chip tone="cyan">accepted · waiting for the bidder</Chip>;
  } else if (me !== null) {
    const ready = readiness(cells, amount);
    if (ready.kind === "ready") {
      const sell = async () => {
        if ((await run(() => actions.list(launch, ready.cell, bid.priceSats, item.id))) !== null) onPublished();
      };
      action = (
        <button className="btn primary" disabled={busy} onClick={() => void sell()}>
          {busy ? "Signing…" : "Sell to this bid"}
        </button>
      );
    } else if (ready.kind === "set-aside") {
      const setAside = async () => {
        const op = await run(() => actions.setAside(launch, ready.from, amount));
        if (op) onDone(op);
      };
      action = (
        <button className="btn" disabled={busy} onClick={() => void setAside()} title="A listing sells one whole cell. This moves the amount into a cell of its own, to yourself.">
          {busy ? "Signing…" : `Set aside ${size}`}
        </button>
      );
    } else {
      action = <span className="tiny faint">You hold {atoms(ready.held, DECIMALS, 2)}.</span>;
    }
  }

  return (
    <tr>
      <td className="mono">{satsPerToken(unitPrice({ priceSats: bid.priceSats, amount }))} sats</td>
      <td className="mono">{size}</td>
      <td className="mono">{group(bid.priceSats)} sats</td>
      <td className="mono">{shortHash(bid.bidder, 8, 4)}</td>
      <td>
        {action}
        {error && <div className="error-text">{error}</div>}
      </td>
    </tr>
  );
}

function PlaceBid({ launch, actions, onPublished }: { launch: Launch; actions: MarketActions; onPublished: () => void }) {
  const [amountText, setAmountText] = useState("");
  const [priceText, setPriceText] = useState("");
  const [placed, setPlaced] = useState(false);
  const { busy, error, run } = useAction();

  const amount = parseAmount(amountText, DECIMALS);
  const amountOk = amount !== null && amount > 0n;
  const price = Number(priceText);
  const priceOk = priceText !== "" && Number.isInteger(price) && price >= DUST_SATS;

  const place = async () => {
    if (!amountOk || !priceOk) return;
    setPlaced(false);
    if ((await run(() => actions.placeBid(launch, amount, price))) !== null) {
      setPlaced(true);
      setAmountText("");
      setPriceText("");
      onPublished();
    }
  };

  return (
    <div className="stack-sm placebid">
      <div className="eyebrow">place a bid</div>
      <div className="grid g3 align-end">
        <Field label="Amount (tokens)" hint={amountText && !amountOk ? "A positive amount." : undefined}>
          <input className="input" inputMode="decimal" placeholder="0.0" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
        <Field label="Total price (sats)" hint={priceText && !priceOk ? `At least ${DUST_SATS} sats.` : undefined}>
          <input className="input" inputMode="numeric" value={priceText} onChange={(e) => setPriceText(e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <button className="btn primary" disabled={!amountOk || !priceOk || busy} onClick={() => void place()}>
          {busy ? "Signing…" : "Place bid"}
        </button>
      </div>
      {amountOk && priceOk && (
        <p className="tiny faint clamp">
          {satsPerToken(unitPrice({ priceSats: price, amount }))} sats per {launch.symbol}.
        </p>
      )}
      <p className="tiny faint clamp">A bid locks nothing. Keep the sats in your wallet to complete it.</p>
      <More>
        <p>
          A bid is a signed intention, not escrow: no sats leave your wallet when you place it. A holder who accepts signs a
          listing for exactly this amount and price; the trade happens only when you complete that purchase, and until then
          anyone could buy the listing first.
        </p>
      </More>
      {placed && <Notice tone="cyan">Bid published. It appears under My orders; complete it there once a holder accepts.</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
