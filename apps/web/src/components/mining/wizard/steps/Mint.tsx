/* Wizard step 3: mint — what the kept hash mints, then the mint's own trace.
 *
 * Before the signature it shows the amount, the hash and the fee side by
 * side; after, the transaction and a link to its proof.
 */

import type { Launch } from "../../../../data/launches";
import type { MiningLoop } from "../../../../hooks/useMiningLoop";
import { atoms, group } from "../../../../lib/format";
import { DECIMALS } from "../../../../lib/standard";
import { Notice } from "../../../../ui/primitives";
import { Funds, TraceRow, Working } from "../shared";

export function MintBody({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  const { state, traces } = ml.loop;
  const best = ml.mining.progress.best;

  if (state.at === "mint" || (state.at === "mine" && ml.keeping)) {
    return (
      <div className="stack-sm">
        <div className="scoreboard wz-mint-sum">
          <div className="stat">
            <div className="k">you mint</div>
            <div className="v amber">
              {atoms(ml.mintable, DECIMALS, 2)}
              <span className="u">{launch.symbol}</span>
            </div>
          </div>
          <div className="stat">
            <div className="k">hash</div>
            <div className="v cyan">
              {best?.clz ?? "—"}
              <span className="u">zero bits</span>
            </div>
          </div>
          <div className="stat">
            <div className="k">network fee</div>
            <div className="v">{ml.costs && state.at === "mint" ? group(ml.costs.network) : "—"}<span className="u">sats</span></div>
          </div>
        </div>
        {state.at === "mine" && state.unarmed?.why === "arm" && <Funds costs={ml.costs} />}
        {state.at === "mine" && state.unarmed?.why !== "arm" && (
          <Working>
            {state.unarmed?.why === "arming" ? "Waiting for the activation's Bitcoin block." : "Waiting for your ticket's Bitcoin block."}
          </Working>
        )}
        {state.at === "mint" && <Funds costs={ml.costs} />}
        {ml.failure && <Notice tone="danger">{ml.failure}</Notice>}
      </div>
    );
  }
  if (state.at === "minting" || state.at === "minted") {
    return (
      <div className="stack-sm">
        <div className="wz-traces">{traces.mint && <TraceRow label="Mint" trace={traces.mint} proof />}</div>
        {state.at === "minting" && (
          <Working>
            Every signature of this round is done. The mint is in the mempool; your wallet shows the tokens as landing
            until one Bitcoin block confirms them.
          </Working>
        )}
      </div>
    );
  }
  return null;
}
