/* The front door: an arcade game-select screen.
 *
 * On top, the arcade stage — every launch an invader, Bitcoin the cannon — with
 * a two-line headline and a HUD of real figures. Under it, the catalogue: one
 * box per launch, sorted and filtered by what someone arriving wants to know,
 * each with its own MINE button. There is no "start mining" without a token:
 * you mine *a* launch, so the choice comes first.
 *
 * "All launches" lists real announcements whose ids match their tokens on CKB.
 * "Hot" is derived from the public feed, never hand-picked: a curated list on a
 * permissionless launchpad would be a lie about how it works. The one
 * exception is narrow and says so: the platform's own DEMO launch, when it
 * exists, is put first as the place to start (`lib/launches/featured.ts`).
 *
 * Under them, a few simulated examples (`data/showcase.ts`) show what a launch
 * looks like deep into its halvings. They have a section of their own, a
 * SIMULATED badge each, and no working link or MINE button.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import { navigate } from "../lib/router";
import type { Launch } from "../data/launches";
import { showcase } from "../data/showcase";
import { useActivity, useLaunchActivity } from "../hooks/useActivity";
import { useLaunches, useTip } from "../hooks/useLaunches";
import { useLaunchesStats } from "../hooks/useLaunchStats";
import { compact, group } from "../lib/format";
import { featuredLaunch } from "../lib/launches/featured";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, PLATFORM_PERCENT, TICKET_SATS } from "../lib/standard";
import { useLaunchRegistry } from "../state/LaunchesProvider";
import { ArcadeScene } from "../components/arcade/ArcadeScene";
import { RewardChart } from "../components/launch/RewardChart";
import { More, Panel, SectionHead } from "../ui/primitives";
import { actionFor, TokenCard, type CardAction } from "../components/launches/TokenCard";
import "../components/launches/launches.css";

type Sort = "hot" | "new" | "halving";
type Filter = "all" | CardAction;

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "halving", label: "Halving soon" },
];

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mining now" },
  { id: "soon", label: "Opening soon" },
  { id: "view", label: "Spent" },
];

/** Minting launches first, soonest halving first; then those still to open; then the spent. */
const PHASE_ORDER: Record<CardAction, number> = { mine: 0, soon: 1, view: 2 };

function sorted(launches: Launch[], sort: Sort, heat: ReadonlyMap<string, number>): Launch[] {
  const newest = (a: Launch, b: Launch) => b.announcedAt.localeCompare(a.announcedAt);
  const list = [...launches];
  switch (sort) {
    case "hot":
      return list.sort((a, b) => (heat.get(b.id) ?? 0) - (heat.get(a.id) ?? 0) || newest(a, b));
    case "new":
      return list.sort(newest);
    case "halving":
      return list.sort(
        (a, b) =>
          PHASE_ORDER[actionFor(a)] - PHASE_ORDER[actionFor(b)] || a.blocksToHalving - b.blocksToHalving || newest(a, b),
      );
  }
}

export function Launches() {
  const launches = useLaunches();
  const tip = useTip();
  const { indexRead, synced } = useLaunchRegistry();
  const activity = useActivity({ limit: 120 });
  const heat = useLaunchActivity(activity.entries);
  const stats = useLaunchesStats(launches);
  const [sort, setSort] = useState<Sort>("hot");
  const [filter, setFilter] = useState<Filter>("all");
  const catalogue = useRef<HTMLElement>(null);

  const shown = useCallback((l: Pick<Launch, "phase">) => filter === "all" || actionFor(l) === filter, [filter]);
  const featured = useMemo(() => featuredLaunch(launches), [launches]);
  const listed = useMemo(
    () => sorted(launches.filter((l) => shown(l) && l.id !== featured?.id), sort, heat),
    [launches, shown, sort, heat, featured],
  );
  const examples = useMemo(() => showcase(tip).filter(shown), [tip, shown]);
  const hottest = useMemo(() => {
    const [top] = sorted(launches, "hot", heat);
    return top && (heat.get(top.id) ?? 0) > 0 ? top.id : null;
  }, [launches, heat]);
  const minted = useMemo(() => [...stats.values()].reduce((n, s) => n + s.supply, 0n), [stats]);
  const mining = launches.filter((l) => l.phase === "minting").length;

  const pick = useCallback((launch: Launch) => navigate(`/launch/${launch.id}`), []);
  const insertCoin = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    catalogue.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    catalogue.current?.focus({ preventScroll: true });
  };

  return (
    <div className="stack-lg home">
      <section className="stage" aria-labelledby="stage-title">
        <div className="stage-body">
          <ArcadeScene launches={launches} tip={tip} onPick={pick} />

          <dl className="stage-hud">
            <div className="hud-level">
              <dt>Level</dt>
              <dd title="The Bitcoin block height: the clock every launch's halvings run on">
                {synced ? `Block ${group(tip)}` : "Block …"}
              </dd>
            </div>
            <div className="hud-score">
              <dt>Hi-score</dt>
              <dd title="Tokens minted across every launch, read from CKB">
                {stats.size > 0 ? `${compact(minted, DECIMALS)} minted` : "—"}
              </dd>
            </div>
            <div className="hud-credits">
              <dt>Credits</dt>
              <dd>1 ticket = {group(TICKET_SATS)} sats</dd>
            </div>
            <div className="hud-players">
              <dt>Players</dt>
              <dd>
                {launches.length} token{launches.length === 1 ? "" : "s"} · {mining} live
              </dd>
            </div>
          </dl>

          <div className="stage-copy">
            <h1 id="stage-title">
              <span className="line">Mine tokens</span>
              <span className="line">
                on <span className="hl">Bitcoin</span>
                <span className="cursor" aria-hidden="true" />
              </span>
            </h1>
            <p className="lede">Every invader is a live launch. Pick one, buy a ticket, mine it in your browser.</p>
            <div className="stage-actions">
              <button type="button" className="btn play lg insert-coin" onClick={insertCoin}>
                <span className="blinker" aria-hidden="true">▶</span> Insert coin
              </button>
              <a className="btn ghost lg" href="#/docs">
                How it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="stack-md home-section" ref={catalogue} tabIndex={-1} aria-labelledby="catalogue-title">
        <div className="toolbar">
          <SectionHead title="All launches" count={launches.length} id="catalogue-title" />
          <span className="spacer" />
          <div className="tabs" role="group" aria-label="Sort">
            {SORTS.map((s) => (
              <button key={s.id} type="button" className={sort === s.id ? "on" : ""} aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="tabs cyan" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={filter === f.id ? "on" : ""} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {listed.length === 0 && !(featured && shown(featured)) ? (
          <Panel>
            <p className="clamp">
              {launches.length === 0
                ? indexRead
                  ? "No launches have been announced yet. "
                  : "Reading the index… "
                : "Nothing here under that filter. "}
              <a href="#/create">Create a token</a>
              {launches.length === 0 ? " and it will be the first." : "."}
            </p>
          </Panel>
        ) : (
          <div className="cardgrid">
            {featured && shown(featured) && (
              <TokenCard entry={featured} tip={tip} synced={synced} stats={stats.get(featured.id)} hot={featured.id === hottest} featured />
            )}
            {listed.map((launch) => (
              <TokenCard key={launch.id} entry={launch} tip={tip} synced={synced} stats={stats.get(launch.id)} hot={launch.id === hottest} />
            ))}
          </div>
        )}
      </section>

      {examples.length > 0 && (
        <section className="stack-md home-section" aria-labelledby="examples-title">
          {/* Real launches above, simulated ones below: a line between them, not just a heading. */}
          <div className="pixel-rule" aria-hidden="true" />
          <div className="toolbar">
            <SectionHead title="Examples" count={examples.length} id="examples-title" />
          </div>
          <p className="tiny faint clamp examples-note">
            Simulated launches further along their schedule — halving 2, halving 9, spent — so you can read a card before a
            real launch gets there. The figures follow the standard's reward; nothing here is on chain, so there is nothing to
            mine, list or buy.
          </p>
          <div className="cardgrid">
            {examples.map((example) => (
              <TokenCard key={example.id} entry={example} tip={tip} synced={synced} mintInstead={featured?.symbol} />
            ))}
          </div>
        </section>
      )}

      <div className="pixel-rule" aria-hidden="true" />

      <More boxed summary="How it works">
        <p>
          A ticket costs <b>{group(TICKET_SATS)} sats</b> plus network fees: the launch's promoter receives most of it, the
          platform {PLATFORM_PERCENT} %, and the RGB++ paymaster its share when the round needs a new miner cell. Its
          Bitcoin output is your mining challenge.
        </p>
        <p>
          A hash with <i>n</i> leading zero bits mints <b>n² tokens</b>, halved every {group(HALVING_BLOCKS)} blocks
          since the launch opened. Below {MIN_CLZ} bits it mints nothing. The ticket fixes the rate.
        </p>
        <p>
          Testnet only. There is no reserve and no floor: a token is worth what someone will pay for it.{" "}
          <a href="#/docs">Read the docs</a>.
        </p>
        <RewardChart h0={0} tip={null} symbol="tokens" height={120} />
      </More>
    </div>
  );
}
