/* This wallet's own operations: what it signed from this browser, and how far
 * each has landed. Kept per address in localStorage by `TokensProvider`, so it
 * is a convenience, not a record — the chain is. */

import type { Launch } from "../../data/launches";
import { useLaunchByToken } from "../../hooks/useLaunches";
import { atoms, group, shortHash } from "../../lib/format";
import { DECIMALS } from "../../lib/standard";
import { useTokens, type Operation } from "../../state/TokensProvider";
import { Chip, Panel } from "../../ui/primitives";
import { TxLink } from "../../ui/TxLink";

export function WalletActivity() {
  const { operations } = useTokens();
  const launchOf = useLaunchByToken();
  if (operations.length === 0) {
    return (
      <Panel>
        <p className="clamp">
          Nothing signed from this browser yet. Tickets, mints, transfers and trades you make appear here, with each
          stage as it lands. <a href="#/activity">Everyone's activity</a> is on the public feed.
        </p>
      </Panel>
    );
  }
  return <OperationsTable operations={operations} launchOf={launchOf} />;
}

function OperationsTable({ operations, launchOf }: { operations: Operation[]; launchOf: (tokenId: string) => Launch | undefined }) {
  const tone = { sent: "cyan", queued: "cyan", settled: "ok", failed: "danger" } as const;
  return (
    <Panel eyebrow="signed from this browser" title="Operations">
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>what</th>
              <th>token</th>
              <th>amount</th>
              <th>stage</th>
              <th>bitcoin</th>
              <th>ckb</th>
            </tr>
          </thead>
          <tbody>
            {operations.map((op) => {
              const launch = launchOf(op.tokenId);
              return (
                <tr key={op.btcTxid}>
                  <td>{op.kind}</td>
                  <td>{launch?.symbol ?? shortHash(op.tokenId, 8, 4)}</td>
                  <td className="mono">
                    {op.atoms ? atoms(BigInt(op.atoms), DECIMALS, 2) : op.sats ? `${group(op.sats)} sats` : "—"}
                  </td>
                  <td><Chip tone={tone[op.stage]} live={op.stage === "sent" || op.stage === "queued"}>{op.stage}</Chip></td>
                  <td><TxLink kind="btc" id={op.btcTxid} className="mono">{op.btcTxid.slice(0, 10)}…</TxLink></td>
                  <td>
                    {op.ckbTxHash ? (
                      <TxLink kind="ckb" id={op.ckbTxHash} className="mono">
                        {op.ckbTxHash.slice(0, 12)}…
                      </TxLink>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
