/* The mining surface: the totals, the live feed, the device, and what the best hash is worth.
 *
 * The totals lead, in one row, because they are what a person watches: what
 * the best hash mints now, how strong it is, how much has been tried, how
 * fast. The buttons that drive the search — start, pause, continue, accept —
 * live in the wizard's bar under it, with every other step's actions, so the
 * page has one place to act from.
 *
 * The search on a ticket is one sweep however often it stops: the counter of
 * nonces tried and the best hash are the ticket's, kept across pauses and
 * reloads (`useMiningSession`), and Continue picks the sweep up where it
 * stopped.
 *
 * The number that matters is "mintable now": the standard reward for the best
 * hash found so far, at the rate this ticket locked in. It is the same function
 * the mint script evaluates (`lib/standard.ts`, checked against the script's
 * vectors), so what this panel shows is exactly what a mint will claim — and
 * the mint script will refuse any other amount.
 */

import type { UseMiningSession } from "../../hooks/useMiningSession";
import type { BackendChoice } from "../../lib/mining";
import { bytesToHex } from "../../lib/bytes";
import { atoms, count, group, rate, shortHash } from "../../lib/format";
import { DECIMALS, MIN_CLZ } from "../../lib/standard";
import type { Ticket } from "../../lib/mining/loop";
import { HashFeed, HashLog } from "./HashFeed";
import { Chip, KV, Notice, Stat } from "../../ui/primitives";
import "./mine-panel.css";

const CHOICES: Array<{ id: BackendChoice; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "gpu", label: "GPU" },
  { id: "cpu", label: "CPU" },
];

export interface MinePanelProps {
  mining: UseMiningSession;
  /** 32-byte challenge, or null when there is no ticket to mine against. */
  challenge: Uint8Array | null;
  ticket: Ticket | null;
  /** What the best hash mints at the ticket's rate (`useMiningLoop`); 0 below the minimum. */
  mintable: bigint;
  symbol: string;
}

export function MinePanel({ mining, challenge, ticket, mintable, symbol }: MinePanelProps) {
  const { sample, running, progress } = mining;
  const gpu = mining.backends.find((b) => b.kind === "gpu");
  // The ticket's best across every run, not only this one's.
  const best = progress.best;

  return (
    <div className="miner compact">
      <div className="scoreboard miner-totals">
        <Stat
          k="mintable now"
          v={mintable > 0n ? atoms(mintable, DECIMALS, 2) : "—"}
          unit={mintable > 0n ? symbol : undefined}
          tone="amber"
          hint={`The reward for the best hash so far, at this ticket's rate. Below ${MIN_CLZ} leading zero bits a ticket mints nothing.`}
        />
        <Stat k="best" v={best ? best.clz : "—"} unit={best ? `of ${MIN_CLZ}+ bits` : undefined} tone="cyan" />
        <Stat
          k="nonces tried"
          v={count(progress.next)}
          hint={`${group(progress.next)}: every nonce below this has been hashed against your ticket, across pauses and reloads`}
        />
        <Stat k="hash rate" v={running ? rate(sample.hashRate) : "—"} />
      </div>

      <div className="miner-body">
        <div className="stack-sm">
          <HashFeed current={sample.current} best={best} running={running} />
          <div className="row wrapped">
            <div className="segmented" role="group" aria-label="Mining device">
              {CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={mining.choice === c.id ? "on" : ""}
                  aria-pressed={mining.choice === c.id}
                  disabled={running}
                  onClick={() => mining.setChoice(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <Chip tone={running ? "amber" : undefined} live={running}>
              {running ? `${sample.backend.toUpperCase()} · ${group(sample.lanes)} lanes` : "idle"}
            </Chip>
            {gpu && (
              <Chip tone={gpu.available ? "cyan" : undefined} title={gpu.detail}>
                webgpu {gpu.available ? "ready" : "off"}
              </Chip>
            )}
          </div>
          {mining.notice && <Notice tone="warn">{mining.notice}</Notice>}
        </div>

        <div className="stack-sm">
          <div>
            <div className="eyebrow">improvement log</div>
            <HashLog entries={mining.log} />
          </div>
          {ticket && challenge && (
            <KV
              rows={[
                ["ticket", `${shortHash(ticket.txid, 8, 4)}:${ticket.vout}`],
                ["rate fixed at", `block ${group(ticket.anchor)}`],
                ["challenge", shortHash(bytesToHex(challenge), 8, 4)],
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
