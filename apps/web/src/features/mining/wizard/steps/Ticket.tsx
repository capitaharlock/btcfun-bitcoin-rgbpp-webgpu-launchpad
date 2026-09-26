/* Wizard step 1: the ticket — what it costs before it is paid, its trace after.
 *
 * The bill lists who is paid and the network fee with one total, and says
 * apart what the rest of the round will cost, so nothing later is a surprise.
 */

import type { Launch } from "@/domain/launches";
import type { Costs } from "@/domain/mining";
import type { MiningLoop } from "@/app/hooks/useMiningLoop";
import { atoms, group } from "@/ui/format";
import { DECIMALS, reward, TICKET_SATS } from "@/domain/protocol";
import { Notice } from "@/ui/primitives";
import { Funds, TraceRow, Working } from "../shared";

export function TicketBody({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const { state, traces } = ml.loop;
  const problem = ml.failure && <Notice tone="danger">{ml.failure}</Notice>;
  const trace = (
    <div className="wz-traces">
      {traces.ticket && <TraceRow label="Ticket" trace={traces.ticket} />}
      {traces.arm && <TraceRow label="Activation" trace={traces.arm} />}
    </div>
  );

  if (state.at === "wallet" || state.at === "reading") return null;

  if (state.at === "buy") {
    return (
      <div className="wz-sent">
        <TicketArt launch={launch} />
        <div className="stack-sm">
          <Bill costs={ml.costs} newCell={state.cell === null} />
          <Funds costs={ml.costs} />
          {problem}
        </div>
      </div>
    );
  }

  if (state.at === "waiting") {
    return (
      <div className="wz-sent">
        <TicketArt launch={launch} paid />
        <div className="stack-sm">
          {trace}
          <Working>One Bitcoin block, about ten minutes, then the RGB++ service completes it on CKB.</Working>
        </div>
      </div>
    );
  }

  const ticket = ml.loop.ticket;
  return (
    <div className="wz-sent">
      <TicketArt launch={launch} paid />
      <div className="stack-sm">
        {trace}
        {ticket && (
          <p className="wz-copy">
            {ticket.settled ? "Confirmed." : "In the mempool — no need to wait: its output is your challenge already."} Rate
            fixed at block {group(ticket.anchor)}: a 24-bit hash mints {atoms(reward(24, launch.h0, ticket.anchor), DECIMALS, 0)}{" "}
            {launch.symbol}.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The ticket, line by line: who is paid, the network fee, one total — and,
 * apart, what the round still costs. No subtotal: the ticket's price is on the
 * ticket drawn beside it.
 */
function Bill({ costs, newCell }: { costs: Costs | null; newCell: boolean }) {
  if (!costs || !costs.split) return <Working>Pricing the ticket…</Working>;
  const { split, paymasterExtra, network, later } = costs;
  return (
    <>
      <dl className="wz-bill">
        <BillRow label="Promoter" sats={split.promoter} />
        <BillRow label="Platform" sats={split.platform} />
        {newCell && <BillRow label="Paymaster · new miner cell" sats={split.paymaster} />}
        {paymasterExtra > 0 && <BillRow label="Paymaster, above its budget" sats={paymasterExtra} />}
        <BillRow label={`Network fee · ${costs.feeRate} sat/vB`} sats={network} />
        <BillRow label="Total" sats={TICKET_SATS + paymasterExtra + network} strong />
      </dl>
      <p className="wz-copy faint">
        Then {newCell ? "the activation and the mint cost" : "the mint costs"} ≈ {group(later)} sats of network fee — no other payment.
      </p>
    </>
  );
}

function BillRow({ label, sats, strong }: { label: string; sats: number; strong?: boolean }) {
  return (
    <div className={strong ? "strong" : undefined}>
      <dt>{label}</dt>
      <dd>{group(sats)} sats</dd>
    </div>
  );
}

/** A ticket, drawn: the thing being bought, with its price on it. */
function TicketArt({ launch, paid = false }: { launch: Launch; paid?: boolean }) {
  return (
    <svg className={`wz-ticket${paid ? " paid" : ""}`} viewBox="0 0 220 120" role="img" aria-label={`${launch.symbol} ticket, ${group(TICKET_SATS)} sats`}>
      <path
        className="wz-ticket-body"
        d="M8 4h204a4 4 0 0 1 4 4v38a14 14 0 0 0 0 28v38a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V74a14 14 0 0 0 0-28V8a4 4 0 0 1 4-4z"
      />
      <line className="wz-ticket-tear" x1="160" y1="12" x2="160" y2="108" />
      <text className="wz-ticket-k" x="20" y="34">TICKET</text>
      <text className="wz-ticket-sym" x="20" y="70">{launch.symbol}</text>
      <text className="wz-ticket-k" x="20" y="98">{group(TICKET_SATS)} SATS</text>
      <text className="wz-ticket-stub" x="188" y="66" textAnchor="middle">{paid ? "PAID" : "×1"}</text>
    </svg>
  );
}
