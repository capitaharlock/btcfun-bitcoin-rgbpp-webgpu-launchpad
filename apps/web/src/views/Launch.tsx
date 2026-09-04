import { useMemo } from "react";
import { navigate } from "../App";
import { getLaunch, stateTone } from "../data/launches";
import { budget, cumulative, maxAtoms, MILESTONES } from "../lib/emission";
import { challengeDigest, fakeBlockHash, type ChallengeFields } from "../lib/challenge";
import { MinePanel } from "../components/mining/MinePanel";
import { EmissionChart } from "../ui/EmissionChart";
import { Chip, KV, Meter, Notice, Panel, Stat } from "../ui/primitives";
import { atoms, blocksAsTime, group, pct } from "../lib/format";

export function LaunchView({ id }: { id: string }) {
  const launch = getLaunch(id);
  const epochIndex = launch ? Math.floor(launch.elapsed / launch.epochBlocks) : 0;

  // The challenge binds the epoch, so it is derived from launch state rather
  // than held in component state: nothing else may change what is being ground.
  const fields = useMemo<ChallengeFields | null>(() => {
    if (!launch) return null;
    return {
      version: "btcfun/0.1-prototype",
      network: "testnet4",
      launch: launch.id,
      epoch: epochIndex,
      btcBlockHash: fakeBlockHash(launch.h0 + epochIndex * launch.epochBlocks),
      ticket: "ticket-prototype-0001",
      owner: "tb1q…prototype-recipient",
    };
  }, [launch, epochIndex]);

  const challenge = useMemo(() => (fields ? challengeDigest(fields) : null), [fields]);

  if (!launch || !fields) {
    return (
      <Panel title="Launch not found">
        <button className="btn" onClick={() => navigate("/")}>Back to launches</button>
      </Panel>
    );
  }

  const max = maxAtoms(launch.schedule);
  const scheduled = cumulative(launch.schedule, BigInt(launch.elapsed));
  const epochBudget = budget(
    launch.schedule,
    BigInt(epochIndex * launch.epochBlocks),
    BigInt((epochIndex + 1) * launch.epochBlocks),
  );
  const blocksLeft = launch.epochBlocks - (launch.elapsed % launch.epochBlocks);
  const schedFrac = Number((scheduled * 10000n) / max) / 10000;
  const mintedFrac = Number((launch.liabilities * 10000n) / max) / 10000;
  const expiredFrac = Math.max(0, schedFrac - mintedFrac);

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost" onClick={() => navigate("/")}>← Launches</button>
        <span className="spacer" />
        <Chip tone={stateTone(launch.state)} live={launch.state === "mining"}>{launch.state}</Chip>
        <Chip>epoch {epochIndex}</Chip>
        <Chip tone="cyan">{blocksLeft} blk to close</Chip>
      </div>

      <section className="split">
        <Panel>
          <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            <span
              style={{
                width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center",
                background: `color-mix(in oklab, ${launch.accent} 20%, var(--surface-3))`,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${launch.accent} 40%, transparent)`,
                fontFamily: "var(--mono)", color: launch.accent, fontSize: 15,
              }}
            >
              {launch.symbol.slice(0, 2)}
            </span>
            <div>
              <h1 style={{ fontSize: 30 }}>{launch.symbol}</h1>
              <p style={{ margin: "2px 0 0" }}>{launch.name} — {launch.blurb}</p>
            </div>
          </div>

          <div className="rule" />

          <div className="statrow">
            <Stat k="scheduled" v={pct(schedFrac)} tone="amber" hint="Share of max supply the schedule has offered" />
            <Stat k="minted" v={pct(mintedFrac)} />
            <Stat k="expired" v={pct(expiredFrac)} tone="danger" hint="Allowance that closed unmined — permanent" />
            <Stat k="addresses" v={group(launch.addresses)} hint="Addresses, not people (PROTOCOL.md §2)" />
          </div>

          <div style={{ marginTop: 16 }}>
            <Meter value={schedFrac} />
            <div className="row tiny faint" style={{ marginTop: 6 }}>
              <span>block offset {group(launch.elapsed)}</span>
              <span className="spacer" />
              <span>{blocksAsTime(launch.elapsed)} since h₀ {group(launch.h0)}</span>
            </div>
          </div>
        </Panel>

        <Panel eyebrow="this epoch" title="Allowance">
          <KV
            rows={[
              ["Epoch budget", `${atoms(epochBudget, launch.schedule.decimals, 2)} ${launch.symbol}`],
              ["Epoch length", `${launch.epochBlocks} blocks`],
              ["Closes in", `${blocksLeft} blk · ${blocksAsTime(blocksLeft)}`],
              ["Ticket price", `${atoms(launch.ticketPrice, 8, 4)} reserve`],
              ["Reserve", atoms(launch.reserve, 8, 2)],
            ]}
          />
          <div className="rule" />
          <Notice tone="cyan">
            Allocation across admitted work is <b>not adopted</b>. The candidate
            in PROTOCOL.md §4.3 caps minting at{" "}
            <span className="mono">floor(ΔR × S / R)</span> so a quiet epoch cannot
            dilute existing backing. See the <a href="#/lab">emission lab</a>.
          </Notice>
        </Panel>
      </section>

      <MinePanel challenge={challenge} fields={fields}>
        <button className="btn ghost" onClick={() => navigate(`/launch/${launch.id}/proof`)}>
          Verify evidence →
        </button>
      </MinePanel>

      <Panel eyebrow="schedule" title="Issuance ceiling and this launch's position">
        <EmissionChart
          schedule={launch.schedule}
          spanBlocks={12096n}
          cursor={BigInt(launch.elapsed)}
          markers={MILESTONES.map((m) => ({ at: m.blocks, label: m.label }))}
          height={210}
        />
      </Panel>
    </div>
  );
}
