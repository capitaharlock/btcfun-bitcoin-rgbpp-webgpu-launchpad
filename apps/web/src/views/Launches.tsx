/* The front door.
 *
 * Someone arriving has one question — what is there, and what can I do with it
 * — so the page answers in that order: a hero that says what the place is, the
 * launches worth a look, then all of them filtered by what you can do.
 *
 * Everything listed is a real announcement whose id matches its token on CKB.
 * "Worth a look" is derived — the busiest in the public feed and the newest —
 * never hand-picked: a curated list on a permissionless launchpad would be a
 * lie about how it works.
 */

import { useMemo, useState } from "react";

import { navigate } from "../App";
import { useActivity, useLaunchActivity } from "../hooks/useActivity";
import { useLaunches, useTip } from "../hooks/useLaunches";
import { ACTIVE } from "../lib/bitcoin/network";
import { atoms, group } from "../lib/format";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, reward, TICKET_SATS } from "../lib/standard";
import { useLaunchRegistry } from "../state/LaunchesProvider";
import { RewardChart } from "../ui/RewardChart";
import { Notice, Panel, Stat } from "../ui/primitives";
import { actionFor, TokenCard, type CardAction } from "../ui/TokenCard";

type Filter = "all" | CardAction;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "mine", label: "Mining now" },
  { id: "soon", label: "Opening soon" },
  { id: "view", label: "Spent" },
];

export function Launches() {
  const launches = useLaunches();
  const tip = useTip();
  const { indexRead } = useLaunchRegistry();
  const activity = useActivity({ limit: 120 });
  const byLaunch = useLaunchActivity(activity.entries);
  const [filter, setFilter] = useState<Filter>("all");

  const featured = useMemo(() => {
    const live = launches.filter((l) => l.phase === "minting");
    const busiest = [...live].sort((a, b) => (byLaunch.get(b.id) ?? 0) - (byLaunch.get(a.id) ?? 0))[0];
    const newest = [...launches].sort((a, b) => b.announcedAt.localeCompare(a.announcedAt))[0];
    return [busiest, newest].filter((l, i, all) => l && all.findIndex((x) => x?.id === l.id) === i);
  }, [launches, byLaunch]);

  const listed = useMemo(
    () => launches.filter((l) => filter === "all" || actionFor(l) === filter),
    [launches, filter],
  );
  const mining = launches.filter((l) => l.phase === "minting");
  const first = mining[0] ?? launches[0];

  return (
    <div className="stack-lg">
      <section className="hero">
        <h1>
          Tokens you <span className="grad-text">mine</span>,
          <br />
          on Bitcoin.
        </h1>
        <p>
          Buy a ticket, grind a hash in your browser, and mint what it is worth into your own
          Bitcoin output — a real RGB++ token on CKB. Every launch follows the same rules; the
          reward halves every week.
        </p>

        <div className="row wrapped" style={{ marginTop: 22, gap: 10 }}>
          <button
            className="btn primary lg"
            disabled={!first}
            onClick={() => first && navigate(`/launch/${first.id}`)}
          >
            Start mining
          </button>
          <button className="btn lg ghost" onClick={() => navigate("/create")}>
            Create your token
          </button>
        </div>

        <div className="hero-stats">
          <Stat k="mining now" v={mining.length} tone="amber" />
          <Stat k="launches" v={launches.length} tone="cyan" />
          <Stat k="public events" v={group(activity.entries.length)} />
          <Stat k="btc height" v={tip ? group(tip) : "—"} small />
        </div>
      </section>

      {featured.length > 0 && (
        <section className="stack-md">
          <div className="row wrapped">
            <h2>Worth a look</h2>
            <span className="spacer" />
            <span className="tiny faint">busiest and newest — derived from the feed, not picked</span>
          </div>
          <div className="cardgrid">
            {featured.map((launch) => (
              <TokenCard
                key={launch!.id}
                launch={launch!}
                tip={tip}
                featured
                activity={byLaunch.get(launch!.id)}
                onOpen={() => navigate(`/launch/${launch!.id}`)}
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
            {listed.map((launch) => (
              <TokenCard
                key={launch.id}
                launch={launch}
                tip={tip}
                activity={byLaunch.get(launch.id)}
                onOpen={() => navigate(`/launch/${launch.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="split">
        <Panel eyebrow="the standard" title="One set of rules for every token">
          <p>
            A ticket costs <b>{group(TICKET_SATS)} sats</b> and pays the launch's promoter. Its Bitcoin output
            is your mining challenge. A hash with <i>n</i> leading zero bits mints <b>n² tokens</b>, halved
            once for every {group(HALVING_BLOCKS)} blocks since the launch opened — the ticket fixes the rate.
            Below {MIN_CLZ} bits it mints nothing.
          </p>
          <RewardChart h0={0} tip={null} symbol="tokens" height={130} />
        </Panel>

        <Panel eyebrow="before you spend anything" title="What is real here">
          <p>
            Tickets are real {ACTIVE.label} transactions paid to the promoter. Mining is real proof of work on
            your own hardware. Minted tokens are RGB++ xUDT cells on CKB testnet, sealed to your Bitcoin
            outputs, and only the mint script can create them — it checks the ticket, the hash and the amount.
          </p>
          <Notice tone="warn">
            This is testnet. There is no reserve and no floor: a token is worth what someone will pay for it.
            Settlement waits for Bitcoin confirmation, so a mint appears as landing for a few blocks first.
          </Notice>
          <p className="tiny faint" style={{ marginBottom: 0 }}>
            A 24-bit hash mints {atoms(reward(24, 0, 0), DECIMALS, 0)} tokens in a launch's first week.
          </p>
        </Panel>
      </section>
    </div>
  );
}
