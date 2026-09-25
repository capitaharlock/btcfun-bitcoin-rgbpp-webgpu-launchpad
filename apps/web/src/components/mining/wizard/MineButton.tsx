/* The launch header's MINE, before the wizard opens.
 *
 * It lives with the wizard because pressing it is what engages the mining
 * loop (`ml.engage`); its look (`.lh-mine`) belongs to the header.
 */

import type { Launch } from "../../../data/launches";
import type { MiningLoop } from "../../../hooks/useMiningLoop";

/** The big button in the launch's header, before the wizard opens. */
export function MineButton({ launch, ml }: { launch: Launch; ml: MiningLoop }) {
  if (ml.loop.state.at === "not-open") {
    return (
      <button className="btn play xl lh-mine" disabled>
        Not open yet
      </button>
    );
  }
  return (
    <button className="btn play xl lh-mine" onClick={ml.engage}>
      <span aria-hidden="true">▶</span> Mine {launch.symbol}
    </button>
  );
}
