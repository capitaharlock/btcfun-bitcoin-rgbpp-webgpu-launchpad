/* Marketplace.
 *
 * The honest version of a token market on an architecture that has no
 * settlement yet. Offers are signed, so nobody can forge or alter one.
 * Payments are real and carry a commitment to the offer they settle, so a
 * payment is evidence rather than a coincidence of amount. The transfer is a
 * signed ledger record like any other.
 *
 * What the page will not do is call this a trade. The taker pays first and the
 * maker signs afterwards; a maker who keeps both is not prevented by anything
 * here. The panel at the top states that, names who is exposed at each status,
 * and says precisely what closes the gap — which is the one thing this whole
 * project exists to build.
 */

import { useState } from "react";

import { navigate } from "../App";
import type { Launch } from "../data/launches";
import { useLaunches, useLaunchRules, useTip } from "../hooks/useLaunches";
import { useLedger } from "../hooks/useLedger";
import { settlementMemo, useMarket, type UseMarket } from "../hooks/useMarket";
import { exportOffer, fillMemo, signOffer, type OfferView } from "../lib/market";
import { signTransfer, type LaunchRules } from "../lib/ledger";
import { txUrl } from "../lib/bitcoin";
import { useWallet } from "../state/WalletProvider";
import { atoms, group, parseAmount } from "../lib/format";
import { Chip, KV, Notice, Panel, Stat } from "../ui/primitives";
import { Copyable } from "../ui/Copyable";

/** Blocks an offer stays valid by default — about a day on mainnet timing. */
const DEFAULT_TTL = 144;

const STATUS_TONE: Record<OfferView["status"], "ok" | "cyan" | "amber" | "warn" | "danger" | undefined> = {
  open: "cyan",
  expired: undefined,
  "awaiting-transfer": "amber",
  settled: "ok",
  invalid: "danger",
};

export function Market({ launchId }: { launchId?: string }) {
  const launches = useLaunches();
  const selected = launches.find((l) => l.id === launchId) ?? launches[0];

  if (!selected) return <Panel title="No launches">Nothing to trade.</Panel>;

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <div>
          <div className="eyebrow">marketplace</div>
          <h1 style={{ fontSize: 28 }}>Offers</h1>
        </div>
        <span className="spacer" />
        <div className="segmented" role="group" aria-label="Launch">
          {launches.map((l) => (
            <button
              key={l.id}
              type="button"
              className={l.id === selected.id ? "on" : ""}
              aria-pressed={l.id === selected.id}
              onClick={() => navigate(`/market/${l.id}`)}
            >
              {l.symbol}
            </button>
          ))}
        </div>
      </div>

      <Notice tone="warn">
        <b>These swaps are not atomic.</b> The taker pays first; the maker signs
        the transfer afterwards. A maker who takes the payment and never signs
        keeps both, and nothing on this page prevents that — the two legs settle
        on different systems and nothing binds them.
        <br />
        <br />
        That is the problem RGB++ single-use seals solve, and the reason this
        project exists. With a seal, an offer commits to a specific Bitcoin
        UTXO, the taker's payment spends it, and the same transaction that moves
        the satoshis authorises the token movement — one transaction, both legs,
        no escrow and no operator. Task <span className="mono">V3</span>. Until
        then every offer below is ranked by who is exposed.
      </Notice>

      <MarketBody key={selected.id} launch={selected} />
    </div>
  );
}

function MarketBody({ launch }: { launch: Launch }) {
  const rules = useLaunchRules(launch);
  const ledger = useLedger(rules);
  const tip = useTip();
  const market = useMarket({
    launch: launch.id,
    decimals: launch.schedule.decimals,
    tipHeight: tip,
    records: ledger.records,
  });
  const wallet = useWallet();
  const held = ledger.balanceOf(wallet.vault?.identity);

  return (
    <div className="stack-lg">
      <section className="split">
        <Panel flush eyebrow="book" title={`${launch.symbol} offers`}>
          {market.offers.length === 0 ? (
            <p className="tiny faint" style={{ padding: 18, margin: 0 }}>
              No offers yet. Sign one on the right, or paste one someone sent
              you — there is no shared order book to read from, because a
              matching service would be an operator everyone has to trust.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th className="right">Price</th>
                  <th className="right">Per token</th>
                  <th className="right">Expires</th>
                  <th className="right">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {market.offers.map((view) => (
                  <OfferRow
                    key={view.id}
                    view={view}
                    launch={launch}
                    rules={rules}
                    market={market}
                    ledger={ledger}
                    tip={tip}
                  />
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div className="stack-lg">
          <MakeOffer launch={launch} market={market} held={held} tip={tip} />
          <ImportOffer market={market} />
        </div>
      </section>

      {market.error && <Notice tone="warn">{market.error}</Notice>}
      {ledger.error && <Notice tone="warn">{ledger.error}</Notice>}
    </div>
  );
}

function OfferRow({
  view,
  launch,
  rules,
  market,
  ledger,
  tip,
}: {
  view: OfferView;
  launch: Launch;
  rules: LaunchRules;
  market: UseMarket;
  ledger: ReturnType<typeof useLedger>;
  tip: number;
}) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  const { offer } = view.signed;
  const mine = wallet.vault?.identity === offer.maker;

  /** Taker leg: pay the price, committing to this offer's id. */
  const pay = async () => {
    if (!wallet.vault) return;
    setBusy(true);
    setError(null);
    try {
      const { txid } = await wallet.pay(offer.payTo, Number(offer.priceSats), fillMemo(view.id));
      market.recordFill({
        offerId: view.id,
        txid,
        taker: wallet.vault.identity,
        paidSats: Number(offer.priceSats),
        at: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Maker leg: sign the transfer the payment was for. */
  const settle = async () => {
    if (!wallet.vault || !view.fill) return;
    setBusy(true);
    setError(null);
    try {
      const record = await signTransfer(wallet.vault, ledger.ledger, rules, {
        to: view.fill.taker,
        amount: BigInt(offer.amount),
        memo: settlementMemo(view.id),
      });
      ledger.append(record);
      market.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr>
        <td className="n">{atoms(BigInt(offer.amount), launch.schedule.decimals, 4)}</td>
        <td className="n">{group(Number(offer.priceSats))} sats</td>
        <td className="n">{view.unitPrice.toFixed(0)}</td>
        <td className="n faint">
          {view.status === "expired" ? "expired" : `${group(offer.expiresAt - tip)} blk`}
        </td>
        <td className="right">
          <Chip tone={STATUS_TONE[view.status]} title={view.fault}>
            {view.status}
          </Chip>
        </td>
        <td className="right">
          <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
            {view.status === "open" && !mine && (
              <button className="btn primary" disabled={busy || !wallet.vault} onClick={() => void pay()}>
                {busy ? "Paying…" : `Pay ${group(Number(offer.priceSats))}`}
              </button>
            )}
            {view.status === "awaiting-transfer" && mine && (
              <button className="btn primary" disabled={busy} onClick={() => void settle()}>
                {busy ? "Signing…" : "Sign the transfer"}
              </button>
            )}
            {view.status === "awaiting-transfer" && !mine && <span className="tiny faint">you are exposed</span>}
            <button className="btn ghost" onClick={() => setShown((s) => !s)}>
              {shown ? "Hide" : "Details"}
            </button>
          </div>
        </td>
      </tr>
      {shown && (
        <tr>
          <td colSpan={6}>
            <div className="stack-sm" style={{ padding: "4px 0 12px" }}>
              <KV
                rows={[
                  ["Offer id", `${view.id.slice(0, 24)}…`],
                  ["Maker", `${offer.maker.slice(0, 20)}…${mine ? " (you)" : ""}`],
                  ["Pay to", offer.payTo],
                  ["Expires at height", group(offer.expiresAt)],
                  ...(view.fill
                    ? ([
                        [
                          "Payment",
                          <a key="tx" href={txUrl(view.fill.txid)} target="_blank" rel="noreferrer">
                            {view.fill.txid.slice(0, 16)}… ↗
                          </a>,
                        ],
                        ["Taker", `${view.fill.taker.slice(0, 20)}…`],
                      ] as Array<[string, React.ReactNode]>)
                    : []),
                ]}
              />
              {view.fault && <Notice tone="danger">{view.fault}</Notice>}
              <Copyable value={exportOffer(view.signed)} label="signed offer" />
              <button className="btn ghost" onClick={() => market.remove(view.id)}>
                Remove from my book
              </button>
              {error && <Notice tone="warn">{error}</Notice>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MakeOffer({
  launch,
  market,
  held,
  tip,
}: {
  launch: Launch;
  market: UseMarket;
  held: bigint;
  tip: number;
}) {
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [ttl, setTtl] = useState(String(DEFAULT_TTL));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const scale = 10n ** BigInt(launch.schedule.decimals);
  const atomsWanted = parseAmount(amount, launch.schedule.decimals);
  const priceSats = /^\d+$/.test(price.trim()) ? BigInt(price.trim()) : null;
  const blocks = Number(ttl);
  const valid =
    atomsWanted !== null && atomsWanted > 0n && atomsWanted <= held && priceSats !== null && priceSats > 0n && blocks > 0;

  const create = async () => {
    if (!wallet.vault || atomsWanted === null || priceSats === null) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const signed = await signOffer(wallet.vault, {
        launch: launch.id,
        amount: atomsWanted,
        priceSats,
        expiresAt: tip + blocks,
      });
      if (market.add(signed)) {
        setCreated(exportOffer(signed));
        setAmount("");
        setPrice("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!wallet.vault) {
    return (
      <Panel eyebrow="sell" title="Make an offer">
        <p>Offers are signed by your wallet key.</p>
        <a className="btn primary" href="#/wallet">Connect a wallet</a>
      </Panel>
    );
  }

  return (
    <Panel eyebrow="sell" title="Make an offer">
      <Stat
        k="you hold"
        v={atoms(held, launch.schedule.decimals, 4)}
        unit={launch.symbol}
        small
        tone={held > 0n ? "amber" : undefined}
      />

      {held === 0n ? (
        <p className="tiny faint" style={{ marginTop: 10 }}>
          Nothing to sell yet. Mine a claim on the{" "}
          <a href={`#/launch/${launch.id}`}>launch page</a> first.
        </p>
      ) : (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="offer-amount">amount ({launch.symbol})</label>
            <div className="row" style={{ gap: 8 }}>
              <input
                id="offer-amount"
                className="input"
                inputMode="decimal"
                placeholder="0.0000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button className="btn" onClick={() => setAmount((Number(held) / Number(scale)).toString())}>
                Max
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="offer-price">price (satoshis)</label>
            <input
              id="offer-price"
              className="input"
              inputMode="numeric"
              placeholder="10000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="offer-ttl">valid for (blocks)</label>
            <input
              id="offer-ttl"
              className="input"
              inputMode="numeric"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
            />
          </div>

          <button className="btn primary block" disabled={!valid || busy} onClick={() => void create()}>
            {busy ? "Signing…" : "Sign the offer"}
          </button>

          {created && (
            <div className="stack-sm">
              <Notice tone="cyan">
                Signed. Send this to a buyer — there is no shared book, so an
                offer reaches someone by being handed over.
              </Notice>
              <Copyable value={created} label="signed offer" />
            </div>
          )}
          {error && <Notice tone="warn">{error}</Notice>}
        </div>
      )}
    </Panel>
  );
}

function ImportOffer({ market }: { market: UseMarket }) {
  const [json, setJson] = useState("");

  return (
    <Panel eyebrow="buy" title="Add an offer you were sent">
      <div className="field">
        <label htmlFor="offer-json">signed offer</label>
        <textarea
          id="offer-json"
          className="input mono"
          placeholder="paste a signed offer"
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </div>
      <button
        className="btn block"
        disabled={!json.trim()}
        onClick={() => {
          if (market.importOffer(json)) setJson("");
        }}
      >
        Verify and add
      </button>
      <Notice>
        The signature is checked before it enters your book, so an altered offer
        is rejected rather than displayed. An offer that fails still appears in
        the table as <span className="mono">invalid</span> if it was already
        there — hiding it would make a tampered offer indistinguishable from one
        that was never sent.
      </Notice>
    </Panel>
  );
}

