/* The market: buy a listing alone, or list your own.
 *
 * A listing is a seller-signed half of a Bitcoin transaction (`lib/rgbpp/
 * sale.ts`). Buying completes it: one transaction pays the seller and moves
 * the tokens to the buyer, and the seller does not need to be online. Nobody
 * holds anything in between — not the seller's tokens, not the buyer's money,
 * not this app.
 *
 * A listing sells one whole cell. Selling part of a balance is two steps:
 * send that part to yourself, which puts it in a cell of its own, then list
 * that cell. Cancelling moves the cell, which spends the output the listing
 * signed and so voids it.
 */

import { useMemo, useState } from "react";
import { sha256 } from "@noble/hashes/sha2";

import { useLaunches } from "../hooks/useLaunches";
import { useListings, type OpenListing } from "../hooks/useListings";
import { record, signActivity } from "../lib/activity";
import { getUtxos } from "../lib/bitcoin";
import { txUrl } from "../lib/bitcoin/network";
import { bytesToHex } from "../lib/bytes";
import { atoms, group, parseAmount, shortHash } from "../lib/format";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { planTransfer, type TokenCell } from "../lib/rgbpp/operations";
import { completePurchase, planPurchase, signListing } from "../lib/rgbpp/sale";
import { DECIMALS } from "../lib/standard";
import { useTokens, type Operation } from "../state/TokensProvider";
import { useWallet } from "../state/WalletProvider";
import type { Launch } from "../data/launches";
import { Chip, Field, Notice, Panel } from "../ui/primitives";
import { Sigil } from "../ui/Sigil";

export function Market() {
  const launches = useLaunches();
  const { listings, loading, reload } = useListings(launches);
  const wallet = useWallet();
  const mine = wallet.vault?.identity ?? null;

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <div>
          <div className="eyebrow">market</div>
          <h1 style={{ fontSize: 30 }}>
            Buy and sell, <span className="grad-text">no middleman</span>
          </h1>
        </div>
        <span className="spacer" />
        <Chip tone="cyan">{listings.length} open</Chip>
      </div>

      <Panel eyebrow="open listings" title="Buy">
        {loading ? (
          <p className="faint" style={{ margin: 0 }}>Reading listings and checking each against the chain…</p>
        ) : listings.length === 0 ? (
          <p style={{ margin: 0 }}>No open listings. Every listing here has been checked live on CKB and Bitcoin.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>token</th>
                  <th>amount</th>
                  <th>price</th>
                  <th>per token</th>
                  <th>seller</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {listings.map((item) => (
                  <ListingRow key={`${item.listing.outPoint.txHash}:${item.listing.outPoint.index}`} item={item} own={item.seller === mine} onDone={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Buying signs one Bitcoin transaction that pays the seller and moves the tokens to you. If someone buys
          first, your transaction is simply rejected and costs nothing.
        </p>
      </Panel>

      <Sell launches={launches} onListed={reload} />
    </div>
  );
}

function ListingRow({ item, own, onDone }: { item: OpenListing; own: boolean; onDone: () => void }) {
  const wallet = useWallet();
  const tokens = useTokens();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Operation | null>(null);
  const { listing, launch, cell } = item;
  const amount = BigInt(listing.amount);
  const perToken = Number(listing.priceSats) / (Number(amount) / 10 ** DECIMALS);

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      const plan = planPurchase(ACTIVE_RGBPP, launch.terms, cell);
      setDone(
        await tokens.submit(
          plan,
          { kind: "buy", launchId: launch.id, tokenId: launch.tokenId, atoms: listing.amount, sats: listing.priceSats },
          (key, _sealed, free, feeRate) => completePurchase(key, listing, plan, free, feeRate),
        ),
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!wallet.vault) return;
    setBusy(true);
    setError(null);
    try {
      // Moving the cell spends the output the listing signed, which voids it.
      const plan = planTransfer(ACTIVE_RGBPP, launch.terms, {
        from: [cell],
        amount,
        to: wallet.vault.address,
        paymaster: await tokens.service.paymaster(),
      });
      setDone(await tokens.submit(plan, { kind: "cancel", launchId: launch.id, tokenId: launch.tokenId, atoms: listing.amount }));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td>
        <span className="row" style={{ gap: 8 }}>
          <Sigil symbol={launch.symbol} accent={launch.accent} size="sm" />
          <a href={`#/launch/${launch.id}`}>{launch.symbol}</a>
        </span>
      </td>
      <td className="mono">{atoms(amount, DECIMALS, 2)}</td>
      <td className="mono">{group(listing.priceSats)} sats</td>
      <td className="mono">{perToken < 1 ? perToken.toFixed(4) : group(Math.round(perToken))} sats</td>
      <td className="mono">{shortHash(listing.seller, 8, 4)}</td>
      <td>
        {done ? (
          <a href={txUrl(done.btcTxid)} target="_blank" rel="noreferrer">{done.kind === "buy" ? "bought" : "cancelled"} ↗</a>
        ) : own ? (
          <button className="btn ghost" disabled={busy} onClick={() => void cancel()}>{busy ? "…" : "Cancel"}</button>
        ) : (
          <button className="btn primary" disabled={busy || !wallet.vault} onClick={() => void buy()}>
            {busy ? "Signing…" : "Buy"}
          </button>
        )}
        {error && <div className="tiny" style={{ color: "var(--danger)", maxWidth: 260 }}>{error}</div>}
      </td>
    </tr>
  );
}

function Sell({ launches, onListed }: { launches: Launch[]; onListed: () => void }) {
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "cyan" | "danger"; text: string } | null>(null);

  if (!wallet.vault) {
    return (
      <Panel eyebrow="sell" title="List your tokens">
        <p style={{ margin: 0 }}><a href="#/wallet">Connect a wallet</a> to list tokens you hold.</p>
      </Panel>
    );
  }
  if (cells.length === 0) {
    return (
      <Panel eyebrow="sell" title="List your tokens">
        <p style={{ margin: 0 }}>You hold no tokens this app knows. Mine some on a launch page first.</p>
      </Panel>
    );
  }

  const selected = cells[Math.min(choice, cells.length - 1)];
  const price = Number(priceText);
  const priceOk = Number.isInteger(price) && price >= 546;
  const split = parseAmount(splitText, DECIMALS);
  const splitOk = split !== null && split > 0n && split < selected.cell.amount;

  const list = async () => {
    const vault = wallet.vault!;
    setBusy(true);
    setMessage(null);
    try {
      const utxos = await getUtxos(vault.address);
      const seal = utxos.find((u) => u.txid === selected.cell.seal.txid && u.vout === selected.cell.seal.vout);
      if (!seal) throw new Error("The output this cell is sealed to is not in your wallet yet.");
      const listing = await vault.use((key) =>
        signListing(key, { launchId: selected.launch.id, tokenId: selected.launch.tokenId }, selected.cell, seal.value, price),
      );
      const meta = JSON.stringify(listing);
      const signed = await signActivity(vault, {
        kind: "offer",
        launch: selected.launch.id,
        amount: selected.cell.amount,
        sats: price,
        ref: bytesToHex(sha256(new TextEncoder().encode(meta))),
        meta,
      });
      await record(signed);
      setMessage({ tone: "cyan", text: "Listed. Anyone can now buy it without you being online." });
      setPriceText("");
      onListed();
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const splitCell = async () => {
    if (!splitOk || split === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const plan = planTransfer(ACTIVE_RGBPP, selected.launch.terms, {
        from: [selected.cell],
        amount: split,
        to: wallet.vault!.address,
        paymaster: await tokens.service.paymaster(),
      });
      await tokens.submit(plan, { kind: "transfer", launchId: selected.launch.id, tokenId: selected.launch.tokenId, atoms: split.toString() });
      setMessage({ tone: "cyan", text: "Splitting. The new cell appears once the transaction settles on CKB." });
      setSplitText("");
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel eyebrow="sell" title="List your tokens">
      <div className="split" style={{ alignItems: "start" }}>
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
          <Notice>
            Signing a listing authorises exactly one thing: this cell's output, in exchange for your price paid to
            your address. Cancel by moving the cell, which voids the signature.
          </Notice>
        </div>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </Panel>
  );
}
