/* One launch: its identity, what the chain says about it, and the mining loop.
 *
 * Every figure on this page is either a protocol constant, a function of the
 * Bitcoin tip, or read from CKB. Supply, cells and your balance come from the
 * chain and can be recomputed by anyone with a CKB node; nothing here is a
 * fixture.
 */

import { navigate } from "../App";
import { phaseTone, type Launch } from "../data/launches";
import { useChainSynced, useLaunch, useTip } from "../hooks/useLaunches";
import { useLaunchStats } from "../hooks/useLaunchStats";
import { addressUrl } from "../lib/bitcoin/network";
import { atoms, blocksAsTime, group, shortHash } from "../lib/format";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, reward, TICKET_SATS } from "../lib/standard";
import { MinerSteps } from "../components/mining/MinerSteps";
import { useTokens } from "../state/TokensProvider";
import { RewardChart } from "../ui/RewardChart";
import { Chip, KV, Notice, Panel, Stat } from "../ui/primitives";
import { Sigil } from "../ui/Sigil";

export function LaunchView({ id }: { id: string }) {
  const launch = useLaunch(id);
  if (!launch) {
    return (
      <Panel title="Launch not found">
        <p>No announcement with this id has reached this browser, or its terms do not match its id.</p>
        <button className="btn" onClick={() => navigate("/")}>Back to launches</button>
      </Panel>
    );
  }
  return <LaunchBody launch={launch} />;
}

function LaunchBody({ launch }: { launch: Launch }) {
  const tip = useTip();
  const synced = useChainSynced();
  const { stats, error } = useLaunchStats(launch);
  const tokens = useTokens();
  const mine = (tokens.holdings?.tokens.get(launch.tokenId) ?? []).reduce((n, c) => n + c.amount, 0n);
  const perTicket24 = launch.open ? reward(24, launch.h0, tip) : reward(24, launch.h0, launch.h0);

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost" onClick={() => navigate("/")}>← Launches</button>
        <span className="spacer" />
        <Chip tone={phaseTone(launch.phase)} live={launch.phase === "minting"}>{launch.phase}</Chip>
        {synced ? (
          launch.open ? (
            <>
              <Chip>halving {launch.halvings}</Chip>
              <Chip tone="cyan">{group(launch.blocksToHalving)} blk · {blocksAsTime(launch.blocksToHalving)} to the next</Chip>
            </>
          ) : (
            <Chip tone="cyan">opens in {group(launch.blocksToHalving)} blk</Chip>
          )
        ) : (
          <Chip live>reading the chain…</Chip>
        )}
      </div>

      <section className={synced ? "split" : "split syncing"} aria-busy={!synced}>
        <Panel>
          <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            <Sigil symbol={launch.symbol} accent={launch.accent} size="lg" />
            <div>
              <h1 style={{ fontSize: 30 }}>{launch.symbol}</h1>
              <p style={{ margin: "2px 0 0" }}>{launch.name} — {launch.blurb}</p>
            </div>
          </div>

          <div className="rule" />

          <div className="statrow">
            <Stat
              k="minted"
              v={stats ? atoms(stats.supply, DECIMALS, 0) : "—"}
              unit={launch.symbol}
              tone="amber"
              hint="Sum of every live cell of this token on CKB"
            />
            <Stat k="token cells" v={stats ? group(stats.tokenCells) : "—"} hint="Cells, not people" />
            <Stat k="miner cells" v={stats ? group(stats.minerCells) : "—"} hint="Cells, not people" />
            <Stat k="you hold" v={atoms(mine, DECIMALS, 2)} unit={launch.symbol} tone="cyan" />
          </div>
          {stats?.truncated && <p className="tiny faint">Counts stop at 2,000 cells; figures are lower bounds.</p>}
          {error && <Notice tone="warn">Could not read CKB: {error}</Notice>}
        </Panel>

        <Panel eyebrow="the standard" title="Same rules as every launch">
          <KV
            rows={[
              ["Ticket", `${group(TICKET_SATS)} sats, to the promoter`],
              ["Reward", `1 token × clz² ÷ 2^halvings (min ${MIN_CLZ} bits)`],
              ["Now, for a 24-bit hash", `${atoms(perTicket24, DECIMALS, 0)} ${launch.symbol}`],
              ["Halving", `every ${group(HALVING_BLOCKS)} blocks from block ${group(launch.h0)}`],
              ["Promoter", <a href={addressUrl(launch.promoter)} target="_blank" rel="noreferrer">{shortHash(launch.promoter, 10, 6)}</a>],
              ["Token id", <span className="mono" title={launch.tokenId}>{shortHash(launch.tokenId, 10, 6)}</span>],
            ]}
          />
          <p className="tiny faint" style={{ marginTop: 10 }}>
            The token is an xUDT on CKB bound to Bitcoin outputs by RGB++. Only the mint script can
            issue it, and only for a paid ticket and a valid hash. <a href="#/lab">How the standard works</a>.
          </p>
        </Panel>
      </section>

      <MinerSteps launch={launch} tip={tip} />

      <Panel eyebrow="schedule" title="What a ticket mints, by halving">
        <RewardChart h0={launch.h0} tip={synced ? tip : null} symbol={launch.symbol} />
      </Panel>
    </div>
  );
}
