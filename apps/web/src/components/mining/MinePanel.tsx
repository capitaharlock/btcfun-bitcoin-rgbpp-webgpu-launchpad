/* The mining surface: device choice, live feed, measured throughput.
 *
 * Deliberately reports what the machine actually did — attempts, rate, best
 * leading zeros, which device served the run — rather than a progress bar
 * toward a reward. PROTOCOL.md §4.2 leaves admission and allocation unresolved,
 * so a candidate found here entitles the miner to nothing, and the panel says
 * so instead of implying otherwise with a filling meter.
 */

import { useMiningSession } from "../../hooks/useMiningSession";
import { expectedClz, weightOf, type BackendChoice } from "../../lib/mining";
import type { ChallengeFields } from "../../lib/challenge";
import { bytesToHex } from "../../lib/sha256";
import { duration, group, rate, shortHash } from "../../lib/format";
import { HashFeed, HashLog } from "../../ui/HashFeed";
import { Chip, KV, Notice, Panel, Stat } from "../../ui/primitives";

const CHOICES: Array<{ id: BackendChoice; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "gpu", label: "GPU" },
  { id: "cpu", label: "CPU" },
];

export interface MinePanelProps {
  /** 32-byte challenge digest for the current epoch, or null while deriving. */
  challenge: Uint8Array | null;
  /** The fields that digest commits to, shown so the binding is inspectable. */
  fields: ChallengeFields;
  /** Rendered under the controls — normally the claim action. */
  children?: React.ReactNode;
}

export function MinePanel({ challenge, fields, children }: MinePanelProps) {
  const mining = useMiningSession(challenge);
  const { sample, running } = mining;
  const gpu = mining.backends.find((b) => b.kind === "gpu");

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
          <HashFeed current={sample.current} best={sample.best} running={running} />

          <div className="statrow">
            <Stat k="hash rate" v={rate(sample.hashRate)} tone="amber" />
            <Stat k="attempts" v={group(sample.hashes)} small />
            <Stat k="elapsed" v={duration(sample.elapsedMs)} small />
            <Stat
              k="best clz"
              v={sample.best ? sample.best.clz : "—"}
              unit={sample.best ? "bits" : undefined}
              tone="cyan"
            />
          </div>

          <div className="row wrapped">
            {running ? (
              <button className="btn lg" onClick={mining.stop}>Stop</button>
            ) : (
              <button className="btn primary lg" onClick={mining.start} disabled={!challenge}>
                Mine
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

            <span className="spacer" />
            {children}
          </div>

          {mining.notice && <Notice tone="warn">{mining.notice}</Notice>}

          {sample.best && (
            <div className="row tiny faint" style={{ gap: 16 }}>
              <span>
                weight clz² = <span className="mono">{weightOf(sample.best.clz)}</span>
              </span>
              <span>
                expected at {group(sample.hashes)} attempts ={" "}
                <span className="mono">{expectedClz(sample.hashes).toFixed(1)}</span>
              </span>
              <span>
                nonce <span className="mono">{group(Number(sample.best.nonce & 0xffffffffn))}</span>
              </span>
            </div>
          )}

          <Notice>
            Every candidate is re-hashed on the CPU before it is shown, so a GPU
            result is never trusted on the driver's word alone. Admission,
            challenge disclosure timing and replay prevention remain unresolved
            (PROTOCOL.md §4.2) — a candidate found here proves work, not
            entitlement.
          </Notice>
        </div>

        <div className="stack-md">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>improvement log</div>
            <HashLog entries={mining.log} />
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>canonical challenge</div>
            <KV
              rows={[
                ["version", fields.version],
                ["network", fields.network],
                ["epoch", String(fields.epoch)],
                ["btc block", shortHash(fields.btcBlockHash, 10, 6)],
                ["ticket", fields.ticket],
                ["digest", challenge ? shortHash(bytesToHex(challenge), 10, 6) : "—"],
              ]}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
