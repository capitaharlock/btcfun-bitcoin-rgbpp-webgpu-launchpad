/* The standard, explained with its own arithmetic.
 *
 * Every launch follows the same rules (`PROTOCOL.md` §4), so this page is the
 * one place to see what they imply. The simulator is deliberately simple — a
 * number of tickets per week and how long each miner grinds — because the
 * questions people actually have are simple: how much gets issued, what does
 * the promoter earn, and what does a token cost to produce as weeks pass.
 *
 * Every figure comes from `reward()`, the function the mint script's vectors
 * pin. Hash strength is expected, not guaranteed: grinding for N attempts
 * gives a best hash of about log2(N) leading zero bits.
 */

import { useMemo, useState } from "react";

import { atoms, group, fixed } from "../lib/format";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, NEW_CELL, REUSE, reward, terminalHalving, TICKET_SATS } from "../lib/standard";
import { RewardChart } from "../components/launch/RewardChart";
import { Field, KV, More, PageHead, Panel, Stat } from "../ui/primitives";

const DEVICES = [
  { id: "phone", label: "Phone CPU", rate: 1e6 },
  { id: "laptop", label: "Laptop CPU", rate: 5e6 },
  { id: "gpu", label: "Browser GPU", rate: 3e8 },
] as const;

const WEEKS = 8;

export function Lab() {
  const [tickets, setTickets] = useState(200);
  const [decay, setDecay] = useState(30);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("laptop");
  const [minutes, setMinutes] = useState(5);

  const rate = DEVICES.find((d) => d.id === device)!.rate;
  const clz = Math.max(0, Math.floor(Math.log2(rate * minutes * 60)));
  const mintable = clz >= MIN_CLZ;

  const weeks = useMemo(
    () =>
      Array.from({ length: WEEKS }, (_, k) => {
        const sold = Math.round(tickets * (1 - decay / 100) ** k);
        const perTicket = mintable ? reward(clz, 0, k * HALVING_BLOCKS) : 0n;
        return { week: k + 1, sold, perTicket, minted: perTicket * BigInt(sold), revenue: sold * REUSE.promoter };
      }),
    [tickets, decay, clz, mintable],
  );
  const supply = weeks.reduce((n, w) => n + w.minted, 0n);
  const revenue = weeks.reduce((n, w) => n + w.revenue, 0);

  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="the standard"
        title={
          <>
            One set of rules, <span className="hl">every token</span>
          </>
        }
        lede="The creator picks a name and an income address — nothing economic."
      />

      <section className="split">
        <Panel eyebrow="rules" title="What every launch shares">
          <KV
            rows={[
              ["Ticket", `${group(TICKET_SATS)} sats: ${group(REUSE.promoter)} to the promoter and ${group(REUSE.platform)} to the platform; ${group(NEW_CELL.promoter)} and ${group(NEW_CELL.platform)} when ${group(NEW_CELL.paymaster)} pay for a new miner cell`],
              ["Challenge", "the ticket's own Bitcoin output"],
              ["Reward", "1 token × clz² for a hash with clz leading zero bits"],
              ["Minimum", `${MIN_CLZ} bits`],
              ["Halving", `every ${group(HALVING_BLOCKS)} Bitcoin blocks from opening; the ticket fixes the rate`],
              ["Supply", `no cap; nothing mints after halving ${terminalHalving(256)}`],
              ["Decimals", String(DECIMALS)],
            ]}
          />
          <More>
            <p>So the supply of any token is simply what its tickets minted, and two tokens' numbers mean the same thing.</p>
          </More>
        </Panel>
        <Panel eyebrow="why these rules" title="What they are for">
          <KV
            rows={[
              ["Immediacy", "you mint what your hash shows"],
              ["Bounded", "cost per token doubles weekly"],
              ["Fair-ish", "1,000× hash rate ≈ 2× tokens"],
              ["Enforced", "by a script on CKB"],
            ]}
          />
          <More>
            <p>
              <b>Immediacy.</b> A miner sees what the best hash is worth while mining and mints exactly that; nobody else's
              turnout changes it.
            </p>
            <p>
              <b>Bounded without a cap.</b> The ticket costs the same while its reward halves weekly, so the cost of making
              one token doubles every week. Mining stops paying long before the arithmetic stops minting.
            </p>
            <p>
              <b>Hardware matters, but slowly.</b> 1,000× the hash rate buys about 10 more leading zero bits: roughly twice
              the tokens, not a thousand times.
            </p>
            <p>
              <b>Enforced on chain.</b> A CKB script checks the ticket payment, the hash and the amount. The client only
              shows the same arithmetic.
            </p>
          </More>
        </Panel>
      </section>

      <Panel eyebrow="simulate" title="Tickets, effort and what gets issued">
        <div className="split">
          <div className="stack-sm">
            <Field label={`Tickets in week 1 — ${group(tickets)}`}>
              <input type="range" min={10} max={5000} step={10} value={tickets} onChange={(e) => setTickets(Number(e.target.value))} />
            </Field>
            <Field label={`Fewer tickets each week — ${decay}%`}>
              <input type="range" min={0} max={90} step={5} value={decay} onChange={(e) => setDecay(Number(e.target.value))} />
            </Field>
            <Field label="Each miner grinds on">
              <div className="segmented" role="group" aria-label="Device">
                {DEVICES.map((d) => (
                  <button key={d.id} type="button" className={device === d.id ? "on" : ""} aria-pressed={device === d.id} onClick={() => setDevice(d.id)}>
                    {d.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`For — ${minutes} min per ticket`} hint={`Expected best hash: ${clz} bits${mintable ? "" : ` — below ${MIN_CLZ}, mints nothing`}.`}>
              <input type="range" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </Field>
          </div>
          <div className="stack-md">
            <div className="scoreboard">
              <Stat k={`issued in ${WEEKS} weeks`} v={atoms(supply, DECIMALS, 0)} tone="amber" />
              <Stat k="promoter income" v={group(revenue)} unit="sats" tone="cyan" />
            </div>
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>week</th>
                    <th>tickets</th>
                    <th>per ticket</th>
                    <th>issued</th>
                    <th>sats per token</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.week}>
                      <td>{w.week}</td>
                      <td className="mono">{group(w.sold)}</td>
                      <td className="mono">{atoms(w.perTicket, DECIMALS, 0)}</td>
                      <td className="mono">{atoms(w.minted, DECIMALS, 0)}</td>
                      <td className="mono">
                        {w.perTicket > 0n ? fixed(TICKET_SATS / (Number(w.perTicket) / 10 ** DECIMALS), 2) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <More summary="What “sats per token” means">
              <p>
                What the ticket costs divided by what it mints: the production cost, which doubles every halving. It is not a
                price — a token is worth what someone pays for it.
              </p>
            </More>
          </div>
        </div>
      </Panel>

      <Panel eyebrow="schedule" title="What one ticket mints, week by week">
        <RewardChart h0={0} tip={null} symbol="tokens" />
      </Panel>
    </div>
  );
}
