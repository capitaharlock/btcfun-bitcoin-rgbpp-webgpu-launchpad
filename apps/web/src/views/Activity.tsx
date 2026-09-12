/* Public activity.
 *
 * The one screen that shows other people. Everything else in this app is one
 * browser's private state; this is the shared index, and the page is explicit
 * about what that means: the server may omit an event, but it cannot forge one,
 * because every row is re-verified here before it is drawn. A row that fails
 * verification is shown as failed rather than hidden — hiding it would make a
 * tampering index indistinguishable from a quiet one.
 */

import { useMemo, useState } from "react";

import { navigate } from "../App";
import { useActivity } from "../hooks/useActivity";
import { useLaunches, useTip } from "../hooks/useLaunches";
import { KIND_LABEL, type ActivityEntry, type ActivityKind } from "../lib/activity";
import { txUrl } from "../lib/bitcoin";
import { atoms, group } from "../lib/format";
import { useWallet } from "../state/WalletProvider";
import { Chip, Notice, Panel, Stat } from "../ui/primitives";
import { Sigil } from "../ui/Sigil";

type Filter = "all" | ActivityKind;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "mint", label: "Mints" },
  { id: "offer", label: "Listings" },
  { id: "fill", label: "Buys" },
  { id: "transfer", label: "Transfers" },
  { id: "launch", label: "New tokens" },
];

export function Activity() {
  const [filter, setFilter] = useState<Filter>("all");
  const activity = useActivity({ limit: 120, ...(filter === "all" ? {} : { kind: filter }) });
  const launches = useLaunches();
  const tip = useTip();
  const wallet = useWallet();

  const bySymbol = useMemo(
    () => new Map(launches.map((l) => [l.id, l])),
    [launches],
  );

  const totals = useMemo(() => {
    const counts = { mint: 0, fill: 0, offer: 0 };
    let satsMoved = 0;
    for (const entry of activity.entries) {
      const { kind, sats } = entry.signed.body;
      if (kind === "mint" || kind === "fill" || kind === "offer") counts[kind]++;
      satsMoved += sats;
    }
    return { ...counts, satsMoved };
  }, [activity.entries]);

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <div>
          <div className="eyebrow">public feed</div>
          <h1 style={{ fontSize: 30 }}>
            What people are <span className="grad-text neon">doing</span>
          </h1>
        </div>
        <span className="spacer" />
        <Chip tone={activity.online ? "ok" : "warn"} live={activity.online}>
          {activity.online ? "index online" : "local only"}
        </Chip>
        <button className="btn ghost" onClick={activity.refresh}>Refresh</button>
      </div>

      <section className="split">
        <Panel flush>
          <div className="row wrapped" style={{ padding: "14px 16px 12px" }}>
            <div className="tabs neon">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={filter === f.id ? "on" : ""}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {activity.loading && activity.entries.length === 0 ? (
            <p className="tiny faint" style={{ padding: "0 16px 18px", margin: 0 }}>Loading…</p>
          ) : activity.entries.length === 0 ? (
            <p className="tiny faint" style={{ padding: "0 16px 18px", margin: 0 }}>
              Nothing yet. Mine a claim or list an offer and it appears here —
              your own events show up even with the index offline.
            </p>
          ) : (
            <div className="feed">
              {activity.entries.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  fresh={activity.fresh.has(entry.id)}
                  mine={entry.signed.body.actor === wallet.vault?.identity}
                  symbol={bySymbol.get(entry.signed.body.launch)?.symbol ?? entry.signed.body.launch}
                  accent={bySymbol.get(entry.signed.body.launch)?.accent ?? "var(--ink-faint)"}
                  decimals={8}
                  onOpen={() => navigate(`/launch/${entry.signed.body.launch}`)}
                />
              ))}
            </div>
          )}
        </Panel>

        <div className="stack-lg">
          <Panel eyebrow="in this window" title="Announced">
            <div className="statrow">
              <Stat k="mints" v={group(totals.mint)} tone="amber" />
              <Stat k="listings" v={group(totals.offer)} tone="violet" />
              <Stat k="buys" v={group(totals.fill)} tone="cyan" />
              <Stat k="sats named" v={group(totals.satsMoved)} small />
            </div>
            <div className="rule" />
            <div className="row tiny faint">
              <span>chain height</span>
              <span className="spacer" />
              <span className="mono">{group(tip)}</span>
            </div>
          </Panel>

          <Panel eyebrow="what this is" title="Announcements, not receipts">
            <p>
              Every row is signed by the person it names, and the signature is
              re-checked in your browser before it is drawn. The server cannot
              forge a row or alter one.
            </p>
            <p>
              A signature proves who wrote the message. It does not prove the
              mint or the purchase happened — anyone can sign a statement that
              is not true, and an index has no ledger to replay it against and no
              Bitcoin node to confirm it with. Treat this as people saying what
              they are doing, not as a record of supply or volume. The numbers
              above count announcements.
            </p>
            <Notice tone={activity.online ? "cyan" : "warn"}>
              {activity.online ? (
                <>
                  What a server like this <b>can</b> do is omit. Nothing here
                  proves the feed is complete, which is the same limitation
                  PROTOCOL.md §2 records for the admission queue.
                </>
              ) : (
                <>
                  The index is unreachable, so this is your own local history.
                  Losing the index costs discovery, never ownership — your
                  records and balances are unaffected.
                  {activity.detail && <> <span className="mono">{activity.detail}</span></>}
                </>
              )}
            </Notice>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Row({
  entry,
  fresh,
  mine,
  symbol,
  accent,
  decimals,
  onOpen,
}: {
  entry: ActivityEntry;
  fresh: boolean;
  mine: boolean;
  symbol: string;
  accent: string;
  decimals: number;
  onOpen: () => void;
}) {
  const { body } = entry.signed;
  const amount = BigInt(body.amount);

  return (
    <div className={`feedrow${fresh ? " fresh" : ""}`}>
      <i className={`kind ${body.kind}`} />
      <Sigil symbol={symbol} accent={accent} size="sm" />

      <span className="what">
        <a
          href={`#/launch/${body.launch}`}
          onClick={(e) => {
            e.preventDefault();
            onOpen();
          }}
        >
          {symbol}
        </a>{" "}
        <span className="faint">{KIND_LABEL[body.kind]}</span>
      </span>

      {amount > 0n && <span className="amount">{atoms(amount, decimals, 4)}</span>}
      {body.sats > 0 && <span className="amount">{group(body.sats)} sats</span>}

      <span className="spacer" />

      {mine && <Chip tone="cyan">you</Chip>}
      {!entry.authentic && <Chip tone="danger">signature failed</Chip>}

      {body.txid && (
        <a href={txUrl(body.txid)} target="_blank" rel="noreferrer" className="who">
          tx ↗
        </a>
      )}
      <span className="who">{body.actor.slice(2, 10)}</span>
      <span className="when">{ago(entry.receivedAt)}</span>
    </div>
  );
}

/** Relative time, coarse on purpose: the index's clock is not authoritative. */
function ago(unixSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}
