/* Listing a cell you hold, at your own price.
 *
 * A listing sells one whole cell. Selling part of a balance is two steps:
 * split that part off to yourself, which puts it in a cell of its own, then
 * list that cell. Cancelling moves the cell, which spends the output the
 * listing signed and so voids it.
 */

import { useMemo, useState } from "react";

import type { Launch } from "@/domain/launches";
import { useAction } from "@/app/hooks/useAction";
import type { MarketActions } from "@/app/hooks/useMarketActions";
import { atoms, parseAmount } from "@/ui/format";
import type { TokenCell } from "@/domain/rgbpp";
import { DECIMALS } from "@/domain/protocol";
import { useTokens } from "@/app/providers/TokensProvider";
import { useWallet } from "@/app/providers/WalletProvider";
import { Field, More, Notice, Panel } from "@/ui/primitives";

export function Sell({ launches, actions, onListed }: { launches: Launch[]; actions: MarketActions; onListed: () => void }) {
  const wallet = useWallet();
  const tokens = useTokens();
  const byToken = useMemo(() => new Map(launches.map((l) => [l.tokenId, l])), [launches]);
  const cells = useMemo(() => {
    const out: Array<{ launch: Launch; cell: TokenCell }> = [];
    for (const [tokenId, list] of tokens.holdings?.tokens ?? []) {
      const launch = byToken.get(tokenId);
      if (launch) for (const cell of list) out.push({ launch, cell });
    }
    return out;
  }, [tokens.holdings, byToken]);

  const [choice, setChoice] = useState(0);
  const [priceText, setPriceText] = useState("");
  const [splitText, setSplitText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  if (!wallet.vault) {
    return (
      <Panel eyebrow="sell" title="List your tokens">
        <p className="clamp"><a href="#/wallet">Connect a wallet</a> to list tokens you hold.</p>
      </Panel>
    );
  }
  if (cells.length === 0) {
    return (
      <Panel eyebrow="sell" title="List your tokens">
        <p className="clamp">You hold no tokens this app knows. Mine some on a launch page first.</p>
      </Panel>
    );
  }

  const selected = cells[Math.min(choice, cells.length - 1)];
  const price = Number(priceText);
  const priceOk = Number.isInteger(price) && price >= 546;
  const split = parseAmount(splitText, DECIMALS);
  const splitOk = split !== null && split > 0n && split < selected.cell.amount;

  const list = async () => {
    setMessage(null);
    if ((await run(() => actions.list(selected.launch, selected.cell, price))) !== null) {
      setMessage("Listed. Anyone can now buy it without you being online.");
      setPriceText("");
      onListed();
    }
  };

  const splitCell = async () => {
    if (!splitOk) return;
    setMessage(null);
    if ((await run(() => actions.setAside(selected.launch, [selected.cell], split))) !== null) {
      setMessage("Splitting. The new cell appears once the transaction settles on CKB.");
      setSplitText("");
    }
  };

  return (
    <Panel eyebrow="sell" title="List your tokens">
      <div className="split">
        <div className="stack-sm">
          <Field label="Cell to sell" hint="A listing sells one whole cell.">
            <select className="input" value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
              {cells.map(({ launch, cell }, i) => (
                <option key={`${cell.seal.txid}:${cell.seal.vout}:${i}`} value={i}>
                  {atoms(cell.amount, DECIMALS, 2)} {launch.symbol} · output {cell.seal.txid.slice(0, 8)}…:{cell.seal.vout}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price (sats, for the whole cell)" hint={priceText && !priceOk ? "At least 546 sats." : "Paid to your address when someone buys."}>
            <input className="input" inputMode="numeric" value={priceText} onChange={(e) => setPriceText(e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <button className="btn primary" disabled={!priceOk || busy} onClick={() => void list()}>
            {busy ? "Signing…" : `List ${atoms(selected.cell.amount, DECIMALS, 2)} ${selected.launch.symbol}`}
          </button>
        </div>

        <div className="stack-sm">
          <Field label="Sell only part? Split it first" hint={splitText && !splitOk ? "Less than the whole cell." : "Sends this much to yourself, in a cell of its own."}>
            <input className="input" inputMode="decimal" placeholder="0.0" value={splitText} onChange={(e) => setSplitText(e.target.value)} />
          </Field>
          <button className="btn" disabled={!splitOk || busy} onClick={() => void splitCell()}>Split</button>
          <More>
            <p>
              Signing a listing authorises exactly one thing: this cell's output, in exchange for your price paid to your
              address. Cancel by moving the cell, which voids the signature.
            </p>
          </More>
        </div>
      </div>
      {message && <Notice tone="cyan">{message}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </Panel>
  );
}
