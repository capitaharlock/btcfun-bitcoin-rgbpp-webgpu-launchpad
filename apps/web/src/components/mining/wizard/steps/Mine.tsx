/* Wizard step 2: mine — the miner itself, and where the ticket stands on the way to a mint.
 *
 * Mining never waits for the ticket to settle; only the mint does, so the
 * ticket's state is shown under the miner rather than blocking it.
 */

import type { ReactNode } from "react";

import type { Launch } from "../../../../data/launches";
import type { MiningLoop } from "../../../../hooks/useMiningLoop";
import { group } from "../../../../lib/format";
import { MIN_CLZ } from "../../../../lib/standard";
import { Notice } from "../../../../ui/primitives";
import { MinePanel } from "../../MinePanel";
import { Funds, TraceRow, Working } from "../shared";

export function MineBody({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const { state } = ml.loop;
  if (state.at !== "mine" && state.at !== "mint") return null;
  return (
    <>
      <MinePanel mining={ml.mining} challenge={ml.challenge} ticket={ml.loop.ticket} mintable={ml.mintable} symbol={launch.symbol} />
      <Readiness ml={ml} />
    </>
  );
}

/**
 * Where the ticket stands on the way to a mint, one line: mining never waits
 * for it, only the mint does. The arming, when it is due, is offered here and
 * signed from the bar.
 */
function Readiness({ ml }: { ml: MiningLoop }) {
  const { state, traces } = ml.loop;
  if (state.at !== "mine" && state.at !== "mint") return null;
  const unarmed = state.at === "mine" ? state.unarmed : null;
  const trace = unarmed?.why === "arming" ? traces.arm : traces.ticket;
  let say: ReactNode;
  switch (unarmed?.why) {
    case "landing":
      say = <Working>Ticket sent — it settles on CKB once a Bitcoin block confirms it. Keep mining meanwhile.</Working>;
      break;
    case "arm":
      say = (
        <p className="wz-copy">
          <b>Your ticket is confirmed — activate it.</b> Activation registers the paid ticket on CKB, the chain that holds
          the tokens, so your hash can be minted. It pays only the network fee
          {ml.costs ? ` (${group(ml.costs.network)} sats)` : ""} and mining keeps running. Button: “Activate ticket”, below.
        </p>
      );
      break;
    case "arming":
      say = <Working>Activation sent — the mint unlocks after its Bitcoin block. Keep mining meanwhile.</Working>;
      break;
    default:
      say = <p className="wz-copy faint">Ticket active: any hash of {MIN_CLZ}+ zero bits can be minted.</p>;
  }
  return (
    <div className="wz-ready">
      {trace && <TraceRow label={unarmed?.why === "arming" ? "Activation" : "Ticket"} trace={trace} />}
      {say}
      {unarmed?.why === "arm" && <Funds costs={ml.costs} />}
      {unarmed?.why === "arm" && ml.failure && <Notice tone="danger">{ml.failure}</Notice>}
    </div>
  );
}
