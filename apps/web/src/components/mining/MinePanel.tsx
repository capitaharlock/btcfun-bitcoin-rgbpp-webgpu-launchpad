/* The mining surface: device choice, live feed, and what the best hash is worth.
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
import { atoms, duration, group, rate, shortHash } from "../../lib/format";
import { DECIMALS, MIN_CLZ, reward } from "../../lib/standard";
import { HashFeed, HashLog } from "../../ui/HashFeed";
import { Chip, KV, Notice, Panel, Stat } from "../../ui/primitives";

const CHOICES: Array<{ id: BackendChoice; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "gpu", label: "GPU" },
  { id: "cpu", label: "CPU" },
];

export interface TicketView {
  txid: string;
  vout: number;
  /** Height the ticket's rate is fixed at. */
  anchor: number;
  /** True once the armed cell exists on CKB, which a mint needs. */
  settled: boolean;
}

export interface MinePanelProps {
  mining: UseMiningSession;
  /** 32-byte challenge, or null when there is no ticket to mine against. */
  challenge: Uint8Array | null;
  ticket: TicketView | null;
  h0: number;
  symbol: string;
  /** Why mining cannot start yet, shown in place of the controls. */
  blocked?: string | null;
  /** The mint action, rendered under the figures once a hash qualifies. */
  action?: React.ReactNode;
}

export function MinePanel({ mining, challenge, ticket, h0, symbol, blocked, action }: MinePanelProps) {
  const { sample, running } = mining;
  const gpu = mining.backends.find((b) => b.kind === "gpu");
  const best = sample.best;
  const mintable = best && ticket ? reward(best.clz, h0, ticket.anchor) : 0n;

  return (
    <Panel
      eyebrow="proof of work"
      title="Mine"
      aside={
        <div className="row">
          <Chip tone={running ? "amber" : undefined} live={running}>
            {running ? `${sample.backend.toUpperCase()} · ${group(sample.lanes)} lanes` : "idle"}
          </Chip>
          {gpu && (
            <Chip tone={gpu.available ? "cyan" : undefined} title={gpu.detail}>
              webgpu {gpu.available ? "ready" : "unavailable"}
            </Chip>
          )}
        </div>
      }
    >
      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack-md">
          <HashFeed current={sample.current} best={best} running={running} />

          <div className="statrow">
            <Stat
              k="mintable now"
              v={mintable > 0n ? atoms(mintable, DECIMALS, 2) : "—"}
              unit={mintable > 0n ? symbol : undefined}
              tone="amber"
              hint={`The reward for the best hash so far, at this ticket's rate. Below ${MIN_CLZ} leading zero bits a ticket mints nothing.`}
            />
            <Stat k="best" v={best ? best.clz : "—"} unit={best ? "zero bits" : undefined} tone="cyan" />
            <Stat k="hash rate" v={rate(sample.hashRate)} small />
            <Stat k="elapsed" v={duration(sample.elapsedMs)} small />
          </div>

          <div className="row wrapped">
            {running ? (
              <button className="btn lg" onClick={mining.stop}>Stop</button>
            ) : (
              <button className="btn primary lg" onClick={mining.start} disabled={!challenge}>
                {best ? "Keep mining" : "Mine"}
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
          </div>

          {blocked && <Notice tone="warn">{blocked}</Notice>}
          {mining.notice && <Notice tone="warn">{mining.notice}</Notice>}
          {action}

          <Notice>
            Each extra leading zero bit takes twice the work and adds a little
            to the reward: {MIN_CLZ} bits mint {group(MIN_CLZ * MIN_CLZ)} tokens
            before halvings, 32 bits mint {group(32 * 32)}. Every candidate is
            re-hashed on the CPU before it is shown, so a GPU result is never
            taken on the driver's word.
          </Notice>
        </div>

        <div className="stack-md">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>improvement log</div>
            <HashLog entries={mining.log} />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>challenge</div>
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
              <p className="tiny faint">
                The challenge is the hash of your ticket's Bitcoin output. It does
                not exist until the ticket is paid, so no work can be done in
                advance, and it can be spent once, so no work is reused.
              </p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
