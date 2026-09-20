/* The mining surface: device choice, live feed, and what the best hash is worth.
 *
 * One button drives it — MINE, then PAUSE, then CONTINUE — because the search
 * on a ticket is one sweep however often it stops: the counter of nonces tried
 * and the best hash are the ticket's, kept across pauses and reloads
 * (`useMiningSession`), and CONTINUE picks the sweep up where it stopped.
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
import { atoms, count, duration, group, rate, shortHash } from "../../lib/format";
import { DECIMALS, MIN_CLZ } from "../../lib/standard";
import type { Ticket } from "../../lib/mining/loop";
import { HashFeed, HashLog } from "../../ui/HashFeed";
import { Chip, KV, More, Notice, Stat } from "../../ui/primitives";

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
  const begun = progress.next > 0n || best !== null;

  return (
    <div className="miner">
      <div className="stack-md">
        <HashFeed current={sample.current} best={best} running={running} />

        <div className="scoreboard">
          <Stat
            k="mintable now"
            v={mintable > 0n ? atoms(mintable, DECIMALS, 2) : "—"}
            unit={mintable > 0n ? symbol : undefined}
            tone="amber"
            hint={`The reward for the best hash so far, at this ticket's rate. Below ${MIN_CLZ} leading zero bits a ticket mints nothing.`}
          />
          <Stat k="best" v={best ? best.clz : "—"} unit={best ? "zero bits" : undefined} tone="cyan" />
          <Stat
            k="nonces tried"
            v={count(progress.next)}
            small
            hint={`${group(progress.next)}: every nonce below this has been hashed against your ticket, across pauses and reloads`}
          />
          <Stat k="hash rate" v={rate(sample.hashRate)} small />
          <Stat k="this run" v={duration(sample.elapsedMs)} small />
        </div>

        <div className="row wrapped">
          {running ? (
            <button className="btn lg" onClick={mining.stop}>Pause</button>
          ) : (
            <button className="btn play lg" onClick={mining.start} disabled={!challenge}>
              {begun ? "Continue" : "Mine"}
            </button>
          )}
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

        <p className="tiny faint clamp">
          The challenge is fixed by your ticket; pausing, reloading or restarting never changes it — more time only means
          more chances at a stronger hash.
        </p>

        {mining.notice && <Notice tone="warn">{mining.notice}</Notice>}

        <More summary="How the reward works">
          <p>
            Each extra leading zero bit takes twice the work and adds a little to the reward: {MIN_CLZ} bits mint{" "}
            {group(MIN_CLZ * MIN_CLZ)} tokens before halvings, 32 bits mint {group(32 * 32)}.
          </p>
          <p>Every candidate is re-hashed on the CPU before it is shown, so a GPU result is never taken on the driver's word.</p>
        </More>
      </div>

      <div className="stack-md">
        <div>
          <div className="eyebrow">improvement log</div>
          <HashLog entries={mining.log} />
        </div>
        <div>
          <div className="eyebrow">challenge</div>
          {ticket && challenge ? (
            <KV
              rows={[
                ["ticket", `${shortHash(ticket.txid, 10, 6)}:${ticket.vout}`],
                ["rate fixed at", `block ${group(ticket.anchor)}`],
                ["challenge", shortHash(bytesToHex(challenge), 10, 6)],
                ["preimage", "challenge ‖ nonce (8 bytes LE)"],
              ]}
            />
          ) : (
            <p className="tiny faint">The hash of your ticket's Bitcoin output. It exists once the ticket is paid.</p>
          )}
        </div>
      </div>
    </div>
  );
}
