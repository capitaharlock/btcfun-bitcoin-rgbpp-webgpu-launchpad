import { navigate } from "../App";
import { launches, stateTone, CURRENT_HEIGHT, type Launch } from "../data/launches";
import { cumulative, maxAtoms, MILESTONES } from "../lib/emission";
import { EmissionChart } from "../ui/EmissionChart";
import { Chip, Meter, Notice, Panel, Stat } from "../ui/primitives";
import { atoms, blocksAsTime, compact, group, pct } from "../lib/format";

function scheduledFraction(l: Launch): number {
  const M = maxAtoms(l.schedule);
  return Number((cumulative(l.schedule, BigInt(l.elapsed)) * 10000n) / M) / 10000;
}

function mintedFraction(l: Launch): number {
  const M = maxAtoms(l.schedule);
  return Number((l.liabilities * 10000n) / M) / 10000;
}

export function Launches() {
  const active = launches.filter((l) => l.state === "mining");
  const hero = active[0] ?? launches[0];

  return (
    <div className="stack-lg">
      <section className="split">
        <Panel>
          <div className="row wrapped" style={{ marginBottom: 14 }}>
            <Chip tone={stateTone(hero.state)} live={hero.state === "mining"}>
              {hero.state}
            </Chip>
            <Chip>epoch {Math.floor(hero.elapsed / hero.epochBlocks)}</Chip>
            <span className="spacer" />
            <span className="eyebrow">block offset {group(hero.elapsed)}</span>
          </div>

          <h1 style={{ marginBottom: 6 }}>
            Tokens are mined,
            <br />
            not bought.
          </h1>
          <p style={{ maxWidth: 560 }}>
            Issuance follows a schedule measured in Bitcoin blocks. Allowance that
            nobody mines expires permanently. Every claim, every expiry and every
            reserve movement is meant to be checkable without trusting this site.
          </p>

          <div className="row wrapped" style={{ marginTop: 18, gap: 10 }}>
            <button className="btn primary lg" onClick={() => navigate(`/launch/${hero.id}`)}>
              Open {hero.symbol} miner
            </button>
            <button className="btn lg ghost" onClick={() => navigate("/lab")}>
              Inspect the schedule
            </button>
          </div>
        </Panel>

        <Panel eyebrow="candidate schedule" title="Issuance ceiling">
          <EmissionChart
            schedule={hero.schedule}
            spanBlocks={12096n}
            cursor={BigInt(hero.elapsed)}
            markers={MILESTONES.slice(0, 4).map((m) => ({ at: m.blocks, label: m.label }))}
            height={170}
          />
          <div className="rule" />
          <div className="statrow">
            <Stat k="half-life" v="1008" unit="blk" small hint="Candidate: half a difficulty period" />
            <Stat k="max supply" v="21M" small />
            <Stat k="by 21 days" v="87.5" unit="%" small tone="amber" />
          </div>
        </Panel>
      </section>

      <Notice>
        <b>Specification prototype.</b> Figures below are deterministic fixtures, not
        chain data. The reserve and allocation rules shown are under review
        (tasks&nbsp;E1–E5) and are not adopted. Nothing here promises capital
        protection or a rising redemption ratio.
      </Notice>

      <Panel flush eyebrow="all launches" title="Launches">
        <table className="table">
          <thead>
            <tr>
              <th>Launch</th>
              <th>State</th>
              <th className="right">Scheduled</th>
              <th className="right">Minted</th>
              <th className="right">Expired</th>
              <th className="right">Reserve</th>
              <th className="right">Addresses</th>
              <th className="right">Age</th>
            </tr>
          </thead>
          <tbody>
            {launches.map((l) => {
              const sched = scheduledFraction(l);
              const minted = mintedFraction(l);
              const expired = Math.max(0, sched - minted);
              return (
                <tr key={l.id} className="clickable" onClick={() => navigate(`/launch/${l.id}`)}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 7,
                          display: "grid",
                          placeItems: "center",
                          background: `color-mix(in oklab, ${l.accent} 20%, var(--surface-3))`,
                          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${l.accent} 40%, transparent)`,
                          fontFamily: "var(--mono)",
                          fontSize: 11,
                          color: l.accent,
                        }}
                      >
                        {l.symbol.slice(0, 2)}
                      </span>
                      <span>
                        <span style={{ color: "var(--ink)" }}>{l.symbol}</span>
                        <span className="faint"> · {l.name}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <Chip tone={stateTone(l.state)} live={l.state === "mining"}>
                      {l.state}
                    </Chip>
                  </td>
                  <td className="n">
                    <div style={{ display: "grid", gap: 5, justifyItems: "end" }}>
                      {pct(sched)}
                      <div style={{ width: 84 }}>
                        <Meter value={sched} />
                      </div>
                    </div>
                  </td>
                  <td className="n">{pct(minted)}</td>
                  <td className="n" style={{ color: expired > 0.01 ? "var(--danger)" : undefined }}>
                    {pct(expired)}
                  </td>
                  <td className="n">{compact(l.reserve, 8)}</td>
                  <td className="n">{group(l.addresses)}</td>
                  <td className="n faint">
                    {l.state === "committed"
                      ? `opens in ${blocksAsTime(l.h0 - CURRENT_HEIGHT)}`
                      : blocksAsTime(l.elapsed)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <section className="grid g3">
        <Panel tight eyebrow="how it works" title="Schedule">
          <p className="tiny">
            The ceiling <span className="mono">A(n) = floor(M × (1 − 2⁻ⁿ/ᴴ))</span> is
            evaluated in integer arithmetic. Budgets telescope: slicing the range
            differently cannot change the total.
          </p>
        </Panel>
        <Panel tight eyebrow="how it works" title="Expiry">
          <p className="tiny">
            An epoch that closes with no admitted work leaves its allowance
            unminted, permanently. Supply reflects participation — it is not a
            direct measure of demand, and the UI does not claim that.
          </p>
        </Panel>
        <Panel tight eyebrow="how it works" title="Backing">
          <p className="tiny">
            Ticket income is segregated from protocol fees and creator escrow.
            Redemption pays <span className="mono">floor(q × R / S)</span>, which
            leaves bounded dust rather than exact invariance.
          </p>
        </Panel>
      </section>

      <Panel tight>
        <div className="row wrapped tiny faint">
          <span>
            Reference: total scheduled at 21 days ={" "}
            <span className="mono">
              {atoms(cumulative(hero.schedule, 3024n), hero.schedule.decimals, 0)}
            </span>{" "}
            of {atoms(maxAtoms(hero.schedule), hero.schedule.decimals, 0)} whole
            tokens ({hero.schedule.decimals} decimals)
          </span>
        </div>
      </Panel>
    </div>
  );
}
