/* The front door.
 *
 * Someone arriving has one question — what is there, and what can I do with it
 * — so the page answers in that order: a hero that says what the place is, a
 * few launches promoted because something is actually happening on them, then
 * the rest filtered by what you can do rather than by internal state names.
 *
 * The filters are derived, never authored. "Mining now" is the schedule and the
 * chain tip. "On the market" is the offer book having live offers. "Worth a
 * look" is the public feed and the cheapest floor. Nothing here is a hand-picked
 * editorial list, because a hand-picked list on a permissionless launchpad is a
 * lie about how it works.
 */

import { useMemo, useState } from "react";

import { navigate } from "../App";
import type { Launch } from "../data/launches";
import { useActivity, useLaunchActivity } from "../hooks/useActivity";
import { useLaunches, useTip } from "../hooks/useLaunches";
import { useOfferSummaries, type OfferSummaries } from "../hooks/useOfferSummary";
import { cumulative, maxAtoms, MILESTONES } from "../lib/emission";
import { group, pct } from "../lib/format";
import { EmissionChart } from "../ui/EmissionChart";
import { Notice, Panel, Stat } from "../ui/primitives";
import { TokenCard, type CardAction } from "../ui/TokenCard";

type Filter = "all" | "mining" | "market" | "soon" | "finished";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "mining", label: "Mining now" },
  { id: "market", label: "On the market" },
  { id: "soon", label: "Opening soon" },
  { id: "finished", label: "Finished" },
];

export function Launches() {
  const launches = useLaunches();
  const tip = useTip();
  const offers = useOfferSummaries(tip);
  const activity = useActivity({ limit: 120 });
  const byLaunch = useLaunchActivity(activity.entries);
  const [filter, setFilter] = useState<Filter>("all");

  const withAction = useMemo(
    () => launches.map((launch) => ({ launch, action: actionFor(launch, offers) })),
    [launches, offers],
  );

  /** Promoted: the busiest live launch, the cheapest tradable one, the newest.
   *  Three slots so the row reads as a shelf rather than a leaderboard. */
  const featured = useMemo(() => {
    const live = withAction.filter((x) => x.action === "mine");
    const tradable = withAction.filter((x) => x.action === "buy");
    const opening = withAction.filter((x) => x.action === "soon");

    const busiest = [...live].sort(
      (a, b) => (byLaunch.get(b.launch.id) ?? 0) - (byLaunch.get(a.launch.id) ?? 0),
    )[0];
    const cheapest = [...tradable].sort(
      (a, b) =>
        (offers.get(a.launch.id)?.floor ?? Infinity) - (offers.get(b.launch.id)?.floor ?? Infinity),
    )[0];
    const newest = [...live, ...opening].sort((a, b) => a.launch.elapsed - b.launch.elapsed)[0];

    const picked: typeof withAction = [];
    for (const candidate of [busiest, cheapest, newest]) {
      if (candidate && !picked.some((p) => p.launch.id === candidate.launch.id)) picked.push(candidate);
    }
    return picked;
  }, [withAction, byLaunch, offers]);

  const listed = useMemo(
    () => withAction.filter(({ action }) => matches(filter, action)),
    [withAction, filter],
  );

  const totals = useMemo(
    () => ({
      mining: withAction.filter((x) => x.action === "mine").length,
      tradable: withAction.filter((x) => x.action === "buy").length,
      events: activity.entries.length,
    }),
    [withAction, activity.entries.length],
  );

  const reference = launches.find((l) => l.state === "mining") ?? launches[0];

  return (
    <div className="stack-lg">
      <section className="hero">
        <h1>
          Tokens you <span className="grad-text">mine</span>,
          <br />
          then trade.
        </h1>
        <p>
          Issuance follows a schedule measured in Bitcoin blocks. Buy a ticket,
          grind a hash in your browser, and what you mine is yours to hold or
          sell. Allowance nobody mines expires for good.
        </p>

        <div className="row wrapped" style={{ marginTop: 22, gap: 10 }}>
          <button
            className="btn primary lg"
            onClick={() => navigate(`/launch/${reference?.id ?? ""}`)}
          >
            Start mining
          </button>
          <button className="btn neon lg" onClick={() => navigate("/market")}>
            Browse the market
          </button>
          <button className="btn lg ghost" onClick={() => navigate("/create")}>
            Create your token
          </button>
        </div>

        <div className="hero-stats">
          <Stat k="mining now" v={totals.mining} tone="amber" />
          <Stat k="on the market" v={totals.tradable} tone="violet" />
          <Stat k="public events" v={group(totals.events)} tone="cyan" />
          <Stat k="btc height" v={group(tip)} small />
        </div>
      </section>

      {featured.length > 0 && (
        <section className="stack-md">
          <div className="row wrapped">
            <h2>Worth a look</h2>
            <span className="spacer" />
            <span className="tiny faint">
              busiest, cheapest and newest — derived from the feed and the books, not picked
            </span>
          </div>
          <div className="cardgrid">
            {featured.map(({ launch, action }) => (
              <TokenCard
                key={launch.id}
                launch={launch}
                action={action}
                tip={tip}
                featured
                offers={offers.get(launch.id)?.open}
                floorPrice={offers.get(launch.id)?.floor ?? undefined}
                activity={byLaunch.get(launch.id)}
                onOpen={() => navigate(destination(launch, action))}
              />
            ))}
          </div>
        </section>
      )}

      <section className="stack-md">
        <div className="row wrapped">
          <h2>All launches</h2>
          <span className="spacer" />
          <div className="tabs">
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

        {listed.length === 0 ? (
          <Panel>
            <p style={{ margin: 0 }}>
              Nothing here yet under that filter.{" "}
              <a href="#/create">Create a token</a> and it will be the first.
            </p>
          </Panel>
        ) : (
          <div className="cardgrid">
            {listed.map(({ launch, action }) => (
              <TokenCard
                key={launch.id}
                launch={launch}
                action={action}
                tip={tip}
                offers={offers.get(launch.id)?.open}
                floorPrice={offers.get(launch.id)?.floor ?? undefined}
                activity={byLaunch.get(launch.id)}
                onOpen={() => navigate(destination(launch, action))}
              />
            ))}
          </div>
        )}
      </section>

      <section className="split">
        <Panel eyebrow="how issuance works" title="A schedule, not a curve">
          <p>
            The ceiling is <span className="mono">A(n) = M × (1 − 2⁻ⁿ/ᴴ)</span>,
            evaluated in integer arithmetic against Bitcoin block height. Half the
            supply is offered in the first 1,008 blocks and 87.5% by day 21. What
            an epoch does not mint is gone for good.
          </p>
          {reference && (
            <EmissionChart
              schedule={reference.schedule}
              spanBlocks={12096n}
              cursor={BigInt(reference.elapsed)}
              markers={MILESTONES.slice(0, 4).map((m) => ({ at: m.blocks, label: m.label }))}
              height={150}
            />
          )}
          <div className="rule" />
          <div className="statrow">
            <Stat k="half-life" v="1008" unit="blk" small hint="Candidate: half a difficulty period" />
            <Stat k="max supply" v="21M" small />
            <Stat k="by 21 days" v="87.5" unit="%" small tone="amber" />
            {reference && (
              <Stat
                k="offered so far"
                v={pct(offeredShare(reference), 1)}
                small
                tone="cyan"
                hint="On the reference launch, against the live chain tip"
              />
            )}
          </div>
        </Panel>

        <Panel eyebrow="before you spend anything" title="What is real here">
          <p>
            Tickets are real transactions on testnet4 and the coins are really
            burned — there is no refund. Mining is real proof of work, measured on
            your own hardware. Ownership is a signed record anyone can replay from
            genesis.
          </p>
          <Notice tone="warn">
            <b>Token settlement is not on chain yet.</b> Records are signed but not
            anchored to Bitcoin or CKB, the reserve is burned rather than
            redeemable, and market swaps are not atomic. Every screen says which of
            those applies to it, and the Proof Explorer lists them per claim.
          </Notice>
        </Panel>
      </section>
    </div>
  );
}

function offeredShare(launch: Launch): number {
  const max = maxAtoms(launch.schedule);
  return Number((cumulative(launch.schedule, BigInt(launch.elapsed)) * 10000n) / max) / 10000;
}

/** What a visitor can do with this launch right now. */
function actionFor(launch: Launch, offers: OfferSummaries): CardAction {
  if (!launch.open) return "soon";
  if (launch.state === "mining") return "mine";
  if (offers.has(launch.id)) return "buy";
  return "view";
}

function matches(filter: Filter, action: CardAction): boolean {
  switch (filter) {
    case "all": return true;
    case "mining": return action === "mine";
    case "market": return action === "buy";
    case "soon": return action === "soon";
    case "finished": return action === "view";
  }
}

function destination(launch: Launch, action: CardAction): string {
  return action === "buy" ? `/market/${launch.id}` : `/launch/${launch.id}`;
}
