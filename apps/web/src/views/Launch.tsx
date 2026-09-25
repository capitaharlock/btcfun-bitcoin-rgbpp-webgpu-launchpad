/* One launch: a header that says what you can do, the mining loop, and the terms.
 *
 * The page is split by what a person came for. The header names the token and
 * holds the one action — MINE. Pressing it turns the header itself into the
 * mining wizard: the name shrinks to a strip and the steps take the box, so the
 * loop happens where the button was rather than somewhere down the page.
 * Everything about the token itself (supply, story, terms, schedule) sits
 * below, in its own section, so mining and reading never compete for the same
 * place.
 *
 * Every figure on this page is either a protocol constant, a function of the
 * Bitcoin tip, or read from CKB. Supply, cells and your balance come from the
 * chain and can be recomputed by anyone with a CKB node; nothing here is a
 * fixture. The links and the story are the creator's signed words and are
 * labelled as such: nothing on chain enforces them. So is the picture, and
 * when the platform supplied it instead, the page says that too.
 */

import { About } from "../components/launch/About";
import { LaunchHeader } from "../components/launch/LaunchHeader";
import type { Launch } from "../data/launches";
import { useLaunch, useTip } from "../hooks/useLaunches";
import { useMiningLoop } from "../hooks/useMiningLoop";
import { navigate } from "../lib/router";
import { Panel } from "../ui/primitives";

export function LaunchView({ id, focusMiner = false }: { id: string; focusMiner?: boolean }) {
  const launch = useLaunch(id);
  if (!launch) {
    return (
      <Panel title="Launch not found">
        <p>No announcement with this id has reached this browser, or its terms do not match its id.</p>
        <button className="btn" onClick={() => navigate("/")}>Back to launches</button>
      </Panel>
    );
  }
  return <LaunchBody launch={launch} focusMiner={focusMiner} />;
}

function LaunchBody({ launch, focusMiner }: { launch: Launch; focusMiner: boolean }) {
  const tip = useTip();
  // Arriving from a MINE button (`/launch/<id>/mine`) opens the wizard; the
  // page still starts at the top, so the header — and its MINE — is what shows.
  const ml = useMiningLoop(launch, tip, focusMiner);

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost sm" onClick={() => navigate("/")}>← Launches</button>
      </div>

      <LaunchHeader launch={launch} ml={ml} />

      <About launch={launch} />
    </div>
  );
}
