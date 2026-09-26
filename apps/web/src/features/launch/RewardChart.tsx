/* What one ticket mints, halving by halving.
 *
 * A step chart of the standard reward for a typical browser hash, drawn from
 * `reward()` itself — the function the mint script enforces — rather than from
 * a smooth curve that only resembles it. The table under it gives the exact
 * amounts for a few hash strengths, so the trade between more work and a later
 * ticket is visible at a glance.
 */

import { useId } from "react";

import { atoms, group } from "@/ui/format";
import { DECIMALS, HALVING_BLOCKS, reward } from "@/domain/protocol";

const SPAN_HALVINGS = 8;
const SHOWN_CLZ = [16, 24, 32, 40];

export function RewardChart({ h0, tip, symbol, height = 170 }: { h0: number; tip: number | null; symbol: string; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const W = 1000;
  const H = height;
  const pad = { t: 12, b: 22 };
  const top = Number(reward(24, h0, h0));
  const yOf = (value: bigint) => pad.t + (1 - Number(value) / top) * (H - pad.t - pad.b);
  const xOf = (k: number) => (k / SPAN_HALVINGS) * W;

  let path = "";
  for (let k = 0; k < SPAN_HALVINGS; k++) {
    const y = yOf(reward(24, h0, h0 + k * HALVING_BLOCKS)).toFixed(1);
    path += `${k === 0 ? "M" : "L"}${xOf(k).toFixed(1)},${y} L${xOf(k + 1).toFixed(1)},${y} `;
  }
  const area = `${path}L${W},${H - pad.b} L0,${H - pad.b} Z`;
  const now = tip !== null && tip >= h0 ? (tip - h0) / HALVING_BLOCKS : null;
  const currentK = now === null ? 0 : Math.floor(now);

  return (
    <div className="stack-md">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        role="img"
        aria-label={`Tokens a 24-bit hash mints, for each of the first ${SPAN_HALVINGS} halvings`}
      >
        <defs>
          <linearGradient id={`reward-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#reward-${uid})`} />
        <path d={path} fill="none" stroke="var(--amber)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: SPAN_HALVINGS }, (_, k) => (
          <text key={k} x={xOf(k) + 6} y={H - 6} fill="var(--ink-faint)" fontSize="12" fontFamily="var(--font-mono)">
            wk {k + 1}
          </text>
        ))}
        {now !== null && now < SPAN_HALVINGS && (
          <line
            x1={xOf(now)}
            x2={xOf(now)}
            y1={pad.t}
            y2={H - pad.b}
            stroke="var(--cyan)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>hash</th>
              {[0, 1, 2, 3].map((k) => (
                <th key={k}>{k === 0 ? (now === null ? "at opening" : "now") : `+${k} halving${k === 1 ? "" : "s"}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHOWN_CLZ.map((clz) => (
              <tr key={clz}>
                <td className="mono" title={`${group(2 ** Math.min(clz, 52))}+ tries`}>{clz} bits</td>
                {[0, 1, 2, 3].map((k) => (
                  <td key={k} className="mono">
                    {atoms(reward(clz, h0, h0 + (currentK + k) * HALVING_BLOCKS), DECIMALS, 0)} {symbol}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
