import { useMemo, useState } from "react";
import { navigate } from "../App";
import { launches } from "../data/launches";
import { redeem, formatRatio, ratioScaled } from "../lib/reserve";
import { Chip, KV, Notice, Panel, Stat } from "../ui/primitives";
import { atoms, group } from "../lib/format";

/** Fixture positions. */
const POSITIONS = [
  { launchId: "mesh", amount: 412_000_000_000n },
  { launchId: "obsv", amount: 96_500_000_000n },
  { launchId: "relic", amount: 1_240_000_000n },
];

export function Holdings() {
  const [redeemPct, setRedeemPct] = useState(25);

  const rows = useMemo(
    () =>
      POSITIONS.map((p) => {
        const launch = launches.find((l) => l.id === p.launchId)!;
        const S = launch.liabilities > 0n ? launch.liabilities : 1n;
        const R = launch.reserve;
        const q = (p.amount * BigInt(redeemPct)) / 100n;
        const { payout, R2, S2 } = redeem(q, R, S);
        const before = ratioScaled(R, S);
        const after = ratioScaled(R2, S2);
        return { launch, position: p.amount, q, payout, before, after, R, S };
      }),
    [redeemPct],
  );

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <div>
          <div className="eyebrow">portfolio</div>
          <h1 style={{ fontSize: 28 }}>Holdings</h1>
        </div>
        <span className="spacer" />
        <Chip tone="warn">fixtures</Chip>
      </div>

      <Notice>
        <span>
          <b>Redemption value is not a price floor.</b> It is the integer payout{" "}
          <span className="mono">floor(q × R / S)</span> in the launch's declared
          reserve asset, under an allocation rule that is not adopted. It does not
          promise recovery of a ticket's cost, a BTC or fiat value, or any market
          price (PROTOCOL.md §4.4).
        </span>
      </Notice>

      <Panel eyebrow="simulate" title="Partial redemption">
        <div className="row wrapped" style={{ gap: 16 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="tiny faint">redeem {redeemPct}% of each position</label>
            <input
              type="range"
              min={1}
              max={100}
              value={redeemPct}
              onChange={(e) => setRedeemPct(Number(e.target.value))}
            />
          </div>
          <Stat k="positions" v={rows.length} small />
        </div>
      </Panel>

      <div className="grid g3">
        {rows.map((r) => (
          <Panel key={r.launch.id} tight>
            <div className="row" style={{ marginBottom: 12 }}>
              <span
                style={{
                  width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center",
                  background: `color-mix(in oklab, ${r.launch.accent} 20%, var(--surface-3))`,
                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${r.launch.accent} 40%, transparent)`,
                  fontFamily: "var(--mono)", fontSize: 11, color: r.launch.accent,
                }}
              >
                {r.launch.symbol.slice(0, 2)}
              </span>
              <b>{r.launch.symbol}</b>
              <span className="spacer" />
              <Chip>{r.launch.state}</Chip>
            </div>

            <Stat
              k="position"
              v={atoms(r.position, r.launch.schedule.decimals, 2)}
              unit={r.launch.symbol}
              small
            />

            <div className="rule" />

            <KV
              rows={[
                ["Redeeming", atoms(r.q, r.launch.schedule.decimals, 2)],
                ["Payout", atoms(r.payout, 8, 4)],
                ["Ratio before", formatRatio(r.before)],
                ["Ratio after", formatRatio(r.after)],
                [
                  "Dust",
                  <span className={r.after < r.before ? "" : "mono"}>
                    {r.after >= r.before ? "none" : "rounding"}
                  </span>,
                ],
              ]}
            />

            <button
              className="btn block"
              style={{ marginTop: 12 }}
              onClick={() => navigate(`/launch/${r.launch.id}`)}
            >
              Open launch
            </button>
          </Panel>
        ))}
      </div>

      <Panel tight>
        <p className="tiny faint" style={{ margin: 0 }}>
          Redemption at <span className="mono">floor(q × R / S)</span> leaves the
          ratio non-decreasing under the rounding shown, but exact real-number
          invariance is not achievable in integers — the residue stays in the
          reserve as bounded dust. Total simulated payout across{" "}
          {group(rows.length)} positions:{" "}
          <span className="mono">
            {atoms(rows.reduce((a, r) => a + r.payout, 0n), 8, 4)}
          </span>{" "}
          reserve atoms.
        </p>
      </Panel>
    </div>
  );
}
