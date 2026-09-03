import { useMemo, useState } from "react";
import {
  CANDIDATE,
  cumulative,
  epochRows,
  maxAtoms,
  MILESTONES,
  terminalOffset,
  type Schedule,
} from "../lib/emission";
import { firstDilution, formatRatio, simulate, type EpochInput } from "../lib/reserve";
import { Bars, EmissionChart } from "../ui/EmissionChart";
import { Chip, Field, KV, Notice, Panel, Stat } from "../ui/primitives";
import { atoms, blocksAsTime, group, pct } from "../lib/format";

/** Turnout shapes used to probe the allocation rules. */
const SHAPES: Record<string, { label: string; note: string; at: (i: number) => number }> = {
  collapse: {
    label: "Launch then collapse",
    note: "Busy first epochs, then one persistent miner. The case E1 has to reproduce.",
    at: (i) => (i < 6 ? 40 - i * 4 : 1),
  },
  steady: {
    label: "Steady turnout",
    note: "Constant participation across the window.",
    at: () => 12,
  },
  sparse: {
    label: "Sparse and lumpy",
    note: "Long empty stretches punctuated by bursts.",
    at: (i) => (i % 5 === 0 ? 18 : i % 3 === 0 ? 2 : 0),
  },
  dead: {
    label: "Never gets traction",
    note: "Almost every epoch expires unmined.",
    at: (i) => (i === 0 ? 3 : i % 9 === 0 ? 1 : 0),
  },
};

export function Lab() {
  const [halfLife, setHalfLife] = useState(1008);
  const [decimals, setDecimals] = useState(8);
  const [epochBlocks, setEpochBlocks] = useState(6);
  const [shape, setShape] = useState<keyof typeof SHAPES>("collapse");
  const [epochCount, setEpochCount] = useState(48);

  const schedule: Schedule = useMemo(
    () => ({ ...CANDIDATE, halfLife: BigInt(halfLife), decimals }),
    [halfLife, decimals],
  );

  const terminal = useMemo(() => terminalOffset(schedule), [schedule]);
  const M = maxAtoms(schedule);

  const rows = useMemo(
    () => epochRows(schedule, BigInt(epochBlocks), epochCount),
    [schedule, epochBlocks, epochCount],
  );

  const epochs: EpochInput[] = useMemo(
    () =>
      rows.map((r, i) => ({
        budget: r.budget,
        tickets: SHAPES[shape].at(i),
        ticketBacking: 20_000_000n,
      })),
    [rows, shape],
  );

  // Seed with a prior epoch's worth of backing so a ratio exists to dilute.
  const seed = useMemo(() => {
    const first = rows[0]?.budget ?? 0n;
    return { reserve: 400_000_000n, liabilities: first > 0n ? first : 1n };
  }, [rows]);

  const uncapped = useMemo(() => simulate(epochs, "uncapped", seed), [epochs, seed]);
  const capped = useMemo(() => simulate(epochs, "backing-limited", seed), [epochs, seed]);

  const dilutionU = firstDilution(uncapped);
  const dilutionC = firstDilution(capped);

  const lastU = uncapped[uncapped.length - 1];
  const lastC = capped[capped.length - 1];

  const expiredU = uncapped.reduce((a, r) => a + r.expired, 0n);
  const expiredC = capped.reduce((a, r) => a + r.expired, 0n);

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <div>
          <div className="eyebrow">tasks E1 · E2 · E4</div>
          <h1 style={{ fontSize: 28 }}>Emission lab</h1>
        </div>
        <span className="spacer" />
        <Chip tone="warn">no rule adopted</Chip>
      </div>

      <Notice>
        <b>This is evidence tooling, not a product screen.</b> It runs the integer
        schedule from PROTOCOL.md §4.1 and reproduces the reserve failure that
        task&nbsp;E1 requires, alongside the §4.3 candidate cap. A green result
        here is not an adoption decision — E5 is.
      </Notice>

      {/* ---------------- schedule ---------------- */}
      <section className="split">
        <Panel eyebrow="§4.1" title="Discrete issuance ceiling">
          <EmissionChart
            schedule={schedule}
            spanBlocks={BigInt(halfLife) * 12n}
            markers={MILESTONES.map((m) => ({ at: m.blocks, label: m.label }))}
            height={200}
          />
          <div className="rule" />
          <table className="table">
            <thead>
              <tr>
                <th>Milestone</th>
                <th className="right">Blocks</th>
                <th className="right">Scheduled</th>
                <th className="right">Share</th>
              </tr>
            </thead>
            <tbody>
              {MILESTONES.map((m) => {
                const c = cumulative(schedule, m.blocks);
                return (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    <td className="n">{group(m.blocks)}</td>
                    <td className="n">{atoms(c, decimals, 0)}</td>
                    <td className="n">{pct(Number((c * 10000n) / M) / 10000, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <div className="stack-md">
          <Panel eyebrow="parameters" title="Schedule">
            <div className="stack-sm">
              <Field label="Half-life" hint={`${halfLife} blocks · ${blocksAsTime(halfLife)}`}>
                <input
                  type="range" min={168} max={4032} step={168}
                  value={halfLife}
                  onChange={(e) => setHalfLife(Number(e.target.value))}
                />
              </Field>
              <Field label="Decimals" hint="frozen before implementation (§2)">
                <input
                  className="input" type="number" min={0} max={18}
                  value={decimals}
                  onChange={(e) => setDecimals(Math.max(0, Math.min(18, Number(e.target.value))))}
                />
              </Field>
              <Field label="Epoch length" hint={`${epochBlocks} blocks · V4 decides this`}>
                <input
                  type="range" min={1} max={36} step={1}
                  value={epochBlocks}
                  onChange={(e) => setEpochBlocks(Number(e.target.value))}
                />
              </Field>
            </div>
          </Panel>

          <Panel eyebrow="§2 · withdrawn claim" title="Terminal block">
            <Stat
              k="schedule stops issuing at offset"
              v={group(terminal)}
              unit="blk"
              tone="danger"
            />
            <p className="tiny" style={{ marginTop: 10 }}>
              With finite integer arithmetic, <span className="mono">floor(M × 2⁻ⁿ/ᴴ)</span>{" "}
              underflows to zero and the tail terminates — about{" "}
              {blocksAsTime(terminal)} after h₀ at these parameters. "Perpetual
              nonzero emission" was withdrawn for exactly this reason; the
              terminal point is a parameter choice, not an accident to hide.
            </p>
          </Panel>
        </div>
      </section>

      {/* ---------------- dilution ---------------- */}
      <Panel
        eyebrow="task E1"
        title="Reserve dilution under falling turnout"
        aside={
          <div className="row">
            <select
              className="input"
              style={{ width: 200 }}
              value={shape}
              onChange={(e) => setShape(e.target.value as keyof typeof SHAPES)}
            >
              {Object.entries(SHAPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: 110 }}
              value={epochCount}
              onChange={(e) => setEpochCount(Number(e.target.value))}
            >
              {[24, 48, 96, 168].map((n) => (
                <option key={n} value={n}>{n} epochs</option>
              ))}
            </select>
          </div>
        }
      >
        <p className="tiny">{SHAPES[shape].note}</p>

        <div className="grid g2" style={{ marginTop: 14 }}>
          <div className="stack-md">
            <div className="row">
              <h3>Uncapped allocation</h3>
              <span className="spacer" />
              {dilutionU
                ? <Chip tone="danger">dilutes at epoch {dilutionU.index}</Chip>
                : <Chip tone="ok">no dilution</Chip>}
            </div>
            <KV
              rows={[
                ["Final backing ratio", formatRatio(lastU?.ratioScaled ?? 0n)],
                ["Minted", atoms(lastU?.liabilities ?? 0n, decimals, 0)],
                ["Expired", atoms(expiredU, decimals, 0)],
              ]}
            />
            <Bars values={uncapped.map((r) => Number(r.ratioScaled / 1_000_000n))} tone="danger" />
            <div className="tiny faint">backing per token atom, per epoch</div>
          </div>

          <div className="stack-md">
            <div className="row">
              <h3>Backing-limited candidate</h3>
              <span className="spacer" />
              {dilutionC
                ? <Chip tone="danger">dilutes at epoch {dilutionC.index}</Chip>
                : <Chip tone="ok">ratio non-decreasing</Chip>}
            </div>
            <KV
              rows={[
                ["Final backing ratio", formatRatio(lastC?.ratioScaled ?? 0n)],
                ["Minted", atoms(lastC?.liabilities ?? 0n, decimals, 0)],
                ["Expired", atoms(expiredC, decimals, 0)],
              ]}
            />
            <Bars values={capped.map((r) => Number(r.ratioScaled / 1_000_000n))} tone="cyan" />
            <div className="tiny faint">
              m ≤ min(B, floor(ΔR × S / R)) — PROTOCOL.md §4.3
            </div>
          </div>
        </div>

        {dilutionU && (
          <>
            <div className="rule" />
            <Notice tone="danger">
              <span>
                <b>Reproduced.</b> Under the uncapped rule, epoch {dilutionU.index}{" "}
                mints {atoms(dilutionU.minted, decimals, 0)} tokens against{" "}
                {atoms(dilutionU.newBacking, 8, 2)} of new backing, moving the ratio
                from {formatRatio(uncapped[dilutionU.index - 1].ratioScaled)} to{" "}
                {formatRatio(dilutionU.ratioScaled)}. Existing holders' backing per
                token falls so a late, cheap entrant can take the scheduled
                allowance. This is the defect that blocks implementation.
              </span>
            </Notice>
          </>
        )}
      </Panel>

      {/* ---------------- per-epoch table ---------------- */}
      <Panel flush eyebrow="§4.1" title="Per-epoch budgets">
        <div style={{ padding: "0 16px 8px" }}>
          <Bars values={rows.map((r) => Number(r.budget / 10n ** BigInt(decimals)))} />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Epoch</th>
              <th className="right">Offsets</th>
              <th className="right">Budget</th>
              <th className="right">Tickets</th>
              <th className="right">Minted (capped)</th>
              <th className="right">Expired</th>
              <th className="right">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 14).map((r, i) => (
              <tr key={r.index}>
                <td className="mono">{r.index}</td>
                <td className="n faint">{group(r.startOffset)}–{group(r.endOffset)}</td>
                <td className="n">{atoms(r.budget, decimals, 2)}</td>
                <td className="n">{epochs[i]?.tickets ?? 0}</td>
                <td className="n">{atoms(capped[i]?.minted ?? 0n, decimals, 2)}</td>
                <td className="n" style={{ color: (capped[i]?.expired ?? 0n) > 0n ? "var(--danger)" : undefined }}>
                  {atoms(capped[i]?.expired ?? 0n, decimals, 2)}
                </td>
                <td className="n">{formatRatio(capped[i]?.ratioScaled ?? 0n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
