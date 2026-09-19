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
import { evidenceFor, KIND_LABEL, type ActivityEntry, type ActivityKind } from "../lib/activity";
import { atoms, group } from "../lib/format";
import { useWallet } from "../state/WalletProvider";
import type { Launch } from "../data/launches";
import { Chip, More, Notice, PageHead, Panel, Stat } from "../ui/primitives";
import { TokenImage } from "../ui/TokenImage";

type Filter = "all" | ActivityKind;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "mint", label: "Mints" },
  { id: "offer", label: "Listings" },
  { id: "bid", label: "Bids" },
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
      <PageHead
        eyebrow="public feed"
        title={
          <>
            What people are <span className="hl magenta">doing</span>
          </>
        }
        lede="Signed announcements, re-checked in your browser. Not receipts."
        aside={
          <>
            <Chip tone={activity.online ? "ok" : "warn"} live={activity.online}>
              {activity.online ? "index online" : "local only"}
            </Chip>
            <button className="btn ghost sm" onClick={activity.refresh}>Refresh</button>
          </>
        }
      />

      <div className="scoreboard">
        <Stat k="mints" v={group(totals.mint)} tone="amber" />
        <Stat k="listings" v={group(totals.offer)} tone="violet" />
        <Stat k="buys" v={group(totals.fill)} tone="cyan" />
        <Stat k="sats named" v={group(totals.satsMoved)} small />
        <Stat k="btc block" v={group(tip)} small />
      </div>

      <Panel flush>
        <div className="feedbar">
          <div className="tabs neon" role="group" aria-label="Show">
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
          <p className="tiny faint feedempty">Loading…</p>
        ) : activity.entries.length === 0 ? (
          <p className="tiny faint feedempty">Nothing yet. Mint or list something and it appears here.</p>
        ) : (
          <div className="feed">
            {activity.entries.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                fresh={activity.fresh.has(entry.id)}
                mine={entry.signed.body.actor === wallet.vault?.identity}
                launch={bySymbol.get(entry.signed.body.launch)}
                decimals={8}
                onOpen={() => navigate(`/launch/${entry.signed.body.launch}`)}
              />
            ))}
          </div>
        )}
      </Panel>

      <More boxed summary="What a row proves">
        <p>
          Every row is signed by the person it names, and the signature is re-checked here before it is drawn. The server
          cannot forge or alter a row.
        </p>
        <p>
          A signature proves who wrote the message, not that the mint or purchase happened. Treat this as people saying what
          they are doing, not as a record of supply or volume. The numbers above count announcements.
        </p>
        {activity.online ? (
          <p>
            What a server like this <b>can</b> do is omit. Nothing here proves the feed is complete, the same limitation
            PROTOCOL.md §2 records for the admission queue.
          </p>
        ) : (
          <Notice tone="warn">
            The index is unreachable, so this is your own local history. Losing the index costs discovery, never ownership.
            {activity.detail && <> <span className="mono">{activity.detail}</span></>}
          </Notice>
        )}
      </More>
    </div>
  );
}

function Row({
  entry,
  fresh,
  mine,
  launch,
  decimals,
  onOpen,
}: {
  entry: ActivityEntry;
  fresh: boolean;
  mine: boolean;
  launch: Launch | undefined;
  decimals: number;
  onOpen: () => void;
}) {
  const { body } = entry.signed;
  const amount = BigInt(body.amount);
  const symbol = launch?.symbol ?? body.launch;
  const evidence = evidenceFor(body);

  return (
    <div className={`feedrow${fresh ? " fresh" : ""}`}>
      <i className={`kind ${body.kind}`} />
      <TokenImage
        art={launch?.art ?? null}
        seed={body.launch}
        accent={launch?.accent ?? "var(--ink-faint)"}
        symbol={symbol}
        size="md"
        still
      />

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

      <span className="figures">
        {amount > 0n && (
          <span className="amount">
            {atoms(amount, decimals, 4)} <span className="unit">{symbol}</span>
          </span>
        )}
        {body.sats > 0 && <span className="amount">{group(body.sats)} sats</span>}
      </span>

      <span className="meta">
        {mine && <Chip tone="cyan">you</Chip>}
        {!entry.authentic && <Chip tone="danger">signature failed</Chip>}
        {evidence.proof && (
          <a href={evidence.proof} className="proof" title="Re-check this mint against both chains">
            proof
          </a>
        )}
        {evidence.tx && (
          <a
            href={evidence.tx.href}
            target="_blank"
            rel="noopener noreferrer"
            className="tx"
            title={`Bitcoin transaction ${evidence.tx.txid}`}
            aria-label={`Bitcoin transaction ${evidence.tx.short} on the explorer`}
          >
            {evidence.tx.short} <span aria-hidden="true">↗</span>
          </a>
        )}
        <span className="who">{body.actor.slice(2, 10)}</span>
        <span className="when">{ago(entry.receivedAt)}</span>
      </span>
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
