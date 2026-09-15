/* Recent trades for one token: sales whose Bitcoin transaction was checked.
 *
 * Each row is a transaction that spent a listed output and paid its seller
 * the listed price (`lib/market/trades.ts`). One not yet in a block is shown as
 * pending, because until then a double spend could still replace it.
 */

import type { MarketTrade } from "../../hooks/useMarket";
import { txUrl } from "../../lib/bitcoin";
import { atoms, group, satsPerToken } from "../../lib/format";
import { unitPrice } from "../../lib/market/book";
import { DECIMALS } from "../../lib/standard";
import { Chip, Panel } from "../../ui/primitives";

const SHOWN = 12;

export function Trades({ trades, symbol }: { trades: MarketTrade[]; symbol: string }) {
  return (
    <Panel eyebrow="recent trades" title={`${symbol} sales`}>
      {trades.length === 0 ? (
        <p className="faint" style={{ margin: 0 }}>No sales found yet.</p>
      ) : (
        <table className="table" aria-label="Recent trades">
          <thead>
            <tr>
              <th>price</th>
              <th>size</th>
              <th>paid</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, SHOWN).map((trade) => (
              <tr key={trade.txid}>
                <td className="mono">{satsPerToken(unitPrice(trade))}</td>
                <td className="mono">{atoms(trade.amount, DECIMALS, 2)}</td>
                <td className="mono">{group(trade.priceSats)} sats</td>
                <td>
                  {!trade.confirmed && <Chip tone="warn">pending</Chip>}{" "}
                  <a href={txUrl(trade.txid)} target="_blank" rel="noreferrer" className="tiny">tx ↗</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tiny faint" style={{ marginBottom: 0 }}>
        A sale is listed here only after its Bitcoin transaction is read and found to pay the seller the listed price
        for the listed output. Sales nobody reported to the index are not found.
      </p>
    </Panel>
  );
}
