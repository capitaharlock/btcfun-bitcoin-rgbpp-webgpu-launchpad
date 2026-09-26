/* Create, step 5: the launch as it now exists.
 *
 * The summary names every transaction and signature the launch rests on, so a
 * creator can check each one, and leads to the mint page, which waits for the
 * opening block.
 */

import { useTip } from "@/app/hooks/useLaunches";
import { blocksAsTime, blocksLabel, group, shortHash } from "@/ui/format";
import type { LaunchCommitment } from "@/domain/launches";
import { navigate } from "@/app/router";
import { KV } from "@/ui/primitives";
import { Sigil } from "@/ui/Sigil";
import { TxLink } from "@/ui/TxLink";
import { StepHead } from "./WizardChrome";

/**
 * The launch as it now exists: the transactions and signatures it rests on,
 * and the way to its mint page, which waits for the opening block.
 */
export function Launched({ launch }: { launch: LaunchCommitment }) {
  const tip = useTip();
  const blocks = tip === null ? null : launch.h0 - tip;
  return (
    <>
      <div className="cw-body">
        <StepHead eyebrow="step 5 of 5 · done" title={`${launch.symbol} is launched`} />
        <div className="split">
          <div className="stack-sm">
            <KV
              rows={[
                ["Launch", <a className="mono" href={`#/launch/${launch.id}`}>{launch.id}</a>],
                ["Token id", <span className="mono" title={launch.tokenId}>{shortHash(launch.tokenId, 10, 8)}</span>],
                [
                  "Registration",
                  <TxLink kind="btc" id={launch.registration} className="mono" title={launch.registration}>
                    {shortHash(launch.registration, 10, 8)} ↗
                  </TxLink>,
                ],
                ["Certificate", <span className="mono" title={launch.certificate}>{shortHash(launch.certificate, 10, 8)}</span>],
                ["Announced by", <span className="mono" title={launch.creator}>{shortHash(launch.creator, 10, 8)}</span>],
                ["Mining opens", `block ${group(launch.h0)}`],
              ]}
            />
          </div>
          <div className="cr-register">
            <div className="row">
              <Sigil seed={launch.id} accent={launch.accent} size="lg" />
              <p className="clamp">
                {blocks !== null && blocks > 0
                  ? `Mining opens in ${blocksLabel(blocks)}, about ${blocksAsTime(blocks)}. The mint page waits for it and says so.`
                  : "Mining is open: the first ticket can be bought now."}
              </p>
            </div>
            <ol className="cr-stages">
              <li className="done">
                <b>Registration paid</b>
                <span>The Bitcoin payment that names these terms. Certified whether or not it has confirmed yet.</span>
              </li>
              <li className="done">
                <b>Certified by btc.fun</b>
                <span>Its signature over the terms and that payment; every miner's first arming carries it on chain.</span>
              </li>
              <li className="done">
                <b>Announced</b>
                <span>Signed with your key; on the launch list now. Every ticket pays your address.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
      <footer className="cw-bar">
        <button className="btn ghost" onClick={() => navigate(`/launch/${launch.id}`)}>
          See the launch
        </button>
        <span className="cw-where">All five steps done</span>
        <div className="cw-go">
          <button className="btn primary lg" onClick={() => navigate(`/launch/${launch.id}/mine`)}>
            Go to the mint page →
          </button>
        </div>
      </footer>
    </>
  );
}
