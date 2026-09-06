/* Create your token.
 *
 * A wizard because the decisions are genuinely sequential — you cannot choose a
 * difficulty sensibly before you know how long an epoch is — and because the
 * old emission lab put every knob on one screen and read as an instrument
 * panel for someone who already understood the model.
 *
 * The lab did not go away. It is step three, with the same integer arithmetic
 * and the same charts, now answering a question the person actually has ("what
 * will my token's issuance look like") instead of a question only the protocol
 * has. The evidence role it plays for tasks E1 and E4 is unchanged.
 *
 * The last step signs a commitment. That is the honest place for the
 * irreversible bit: a launch opens at a *future* Bitcoin height, so the creator
 * cannot mine their own launch before anyone else has heard of it (§5).
 */

import { useMemo, useState } from "react";

import { navigate } from "../App";
import { useTip } from "../hooks/useLaunches";
import { useLaunchRegistry } from "../state/LaunchesProvider";
import { useWallet } from "../state/WalletProvider";
import {
  createLaunch,
  commitmentFor,
  idFor,
  validate,
  type DraftFaults,
  type LaunchDraft,
} from "../lib/launches/create";
import { CANDIDATE, cumulative, maxAtoms, MILESTONES, terminalOffset } from "../lib/emission";
import { atoms, blocksAsTime, group, pct } from "../lib/format";
import { EmissionChart } from "../ui/EmissionChart";
import { Chip, Field, KV, Notice, Panel, Stat } from "../ui/primitives";
import { Sigil } from "../ui/Sigil";

const ACCENTS = [
  { id: "var(--amber)", label: "Amber" },
  { id: "var(--cyan)", label: "Cyan" },
  { id: "var(--violet)", label: "Violet" },
  { id: "var(--magenta)", label: "Magenta" },
  { id: "var(--mint)", label: "Mint" },
  { id: "var(--warn)", label: "Gold" },
];

const STEPS = ["Identity", "Access", "Emission", "Commit"] as const;
type StepIndex = 0 | 1 | 2 | 3;

const INITIAL: LaunchDraft = {
  symbol: "",
  name: "",
  blurb: "",
  opensInBlocks: 6,
  epochBlocks: 6,
  halfLife: 1008,
  decimals: 8,
  ticketSats: 2000,
  minClz: 24,
  accent: "var(--amber)",
};

/** Which draft fields each step is responsible for. Drives the "done" ticks
 *  and stops someone reaching Commit with an invalid symbol behind them. */
const OWNED: Record<StepIndex, Array<keyof LaunchDraft>> = {
  0: ["symbol", "name", "blurb"],
  1: ["opensInBlocks", "epochBlocks", "ticketSats", "minClz"],
  2: ["halfLife", "decimals"],
  3: [],
};

export function Create() {
  const [step, setStep] = useState<StepIndex>(0);
  const [draft, setDraft] = useState<LaunchDraft>(INITIAL);
  const faults = useMemo(() => validate(draft), [draft]);

  const set = <K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const clean = (index: StepIndex) => OWNED[index].every((field) => !faults[field]);
  const reachable = (index: StepIndex) =>
    index === 0 || ([0, 1, 2] as StepIndex[]).slice(0, index).every(clean);

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <div>
          <div className="eyebrow">create</div>
          <h1 style={{ fontSize: 30 }}>
            Launch your own <span className="grad-text">token</span>
          </h1>
        </div>
        <span className="spacer" />
        <Chip tone="cyan">testnet4</Chip>
      </div>

      <div className="wizard">
        <nav className="steps" aria-label="Steps">
          {STEPS.map((label, i) => {
            const index = i as StepIndex;
            return (
              <button
                key={label}
                type="button"
                className={`${step === index ? "on" : ""}${clean(index) && index < step ? " done" : ""}`}
                disabled={!reachable(index)}
                onClick={() => setStep(index)}
              >
                <span className="num">{i + 1}</span>
                {label}
              </button>
            );
          })}
        </nav>

        <div className="stack-lg">
          {step === 0 && <Identity draft={draft} faults={faults} set={set} />}
          {step === 1 && <Access draft={draft} faults={faults} set={set} />}
          {step === 2 && <Emission draft={draft} faults={faults} set={set} />}
          {step === 3 && <Commit draft={draft} />}

          {step < 3 && (
            <div className="row">
              {step > 0 && (
                <button className="btn ghost" onClick={() => setStep((s) => (s - 1) as StepIndex)}>
                  ← Back
                </button>
              )}
              <span className="spacer" />
              <button
                className="btn primary lg"
                disabled={!clean(step)}
                onClick={() => setStep((s) => (s + 1) as StepIndex)}
              >
                Continue →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  draft: LaunchDraft;
  faults: DraftFaults;
  set: <K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) => void;
}

function Identity({ draft, faults, set }: StepProps) {
  return (
    <Panel eyebrow="step 1" title="What is it called?">
      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack-sm">
          <Field label="Symbol" hint={faults.symbol ?? "2–8 characters. This becomes the URL."}>
            <input
              className="input"
              placeholder="MESH"
              maxLength={8}
              value={draft.symbol}
              onChange={(e) => set("symbol", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Name" hint={faults.name}>
            <input
              className="input"
              placeholder="Meshwork"
              maxLength={40}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="One sentence" hint={faults.blurb ?? `${draft.blurb.length}/160`}>
            <textarea
              className="input"
              placeholder="Community token for a mesh-relay operators' group."
              maxLength={160}
              value={draft.blurb}
              onChange={(e) => set("blurb", e.target.value)}
            />
          </Field>

          <Field label="Colour">
            <div className="row wrapped" style={{ gap: 8 }}>
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-label={a.label}
                  aria-pressed={draft.accent === a.id}
                  onClick={() => set("accent", a.id)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    cursor: "pointer",
                    background: a.id,
                    border:
                      draft.accent === a.id ? "2px solid var(--ink)" : "1px solid var(--line-strong)",
                  }}
                />
              ))}
            </div>
          </Field>
        </div>

        <Panel tight eyebrow="preview" title="How it will look">
          <div className="row" style={{ gap: 12 }}>
            <Sigil symbol={draft.symbol || "??"} accent={draft.accent} size="lg" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 620 }}>{draft.symbol || "SYMBOL"}</div>
              <div className="tiny faint">{draft.name || "Your token's name"}</div>
            </div>
          </div>
          <div className="rule" />
          <p className="tiny" style={{ margin: 0 }}>
            {draft.blurb || "One sentence that tells someone what this is for."}
          </p>
          <div className="rule" />
          <div className="tiny faint">
            URL: <span className="mono">/launch/{idFor(draft.symbol) || "symbol"}</span>
          </div>
        </Panel>
      </div>
    </Panel>
  );
}

function Access({ draft, faults, set }: StepProps) {
  const seconds = draft.minClz >= 0 ? 2 ** draft.minClz / 5_000_000 : 0;

  return (
    <Panel eyebrow="step 2" title="Who can mine it, and how hard?">
      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack-sm">
          <Field
            label="Opens in (blocks)"
            hint={faults.opensInBlocks ?? "A launch must open at a future height, so you cannot mine it before announcing it."}
          >
            <input
              className="input"
              type="number"
              min={1}
              value={draft.opensInBlocks}
              onChange={(e) => set("opensInBlocks", Math.max(1, Number(e.target.value) | 0))}
            />
          </Field>
          <Field label="Epoch length (blocks)" hint={faults.epochBlocks ?? blocksAsTime(draft.epochBlocks)}>
            <input
              className="input"
              type="number"
              min={1}
              max={144}
              value={draft.epochBlocks}
              onChange={(e) => set("epochBlocks", Math.max(1, Number(e.target.value) | 0))}
            />
          </Field>
          <Field label="Ticket price (sats)" hint={faults.ticketSats ?? "Paid per attempt, and burned — there is no refund."}>
            <input
              className="input"
              type="number"
              min={546}
              step={100}
              value={draft.ticketSats}
              onChange={(e) => set("ticketSats", Math.max(0, Number(e.target.value) | 0))}
            />
          </Field>
          <Field label={`Difficulty — ${draft.minClz} leading zero bits`} hint={faults.minClz}>
            <input
              type="range"
              min={8}
              max={32}
              value={draft.minClz}
              onChange={(e) => set("minClz", Number(e.target.value))}
            />
          </Field>
        </div>

        <Panel tight eyebrow="what that means" title="For someone mining">
          <KV
            rows={[
              ["Expected attempts", group(2 ** draft.minClz)],
              ["On a CPU (~5 MH/s)", seconds < 1 ? "under a second" : humanSeconds(seconds)],
              ["On a GPU (~300 MH/s)", humanSeconds(Math.max(0.01, seconds / 60))],
              ["Cost per attempt", `${group(draft.ticketSats)} sats`],
              ["Epoch closes every", blocksAsTime(draft.epochBlocks)],
            ]}
          />
          <div className="rule" />
          <Notice tone={draft.minClz > 28 ? "warn" : "cyan"}>
            {draft.minClz > 28
              ? "Above 28 bits, a laptop CPU takes minutes per claim. That is a real barrier — pick it deliberately."
              : "Difficulty sets how long a claim takes, not how much it pays. The amount comes from the schedule."}
          </Notice>
        </Panel>
      </div>
    </Panel>
  );
}

function Emission({ draft, faults, set }: StepProps) {
  const schedule = useMemo(
    () => ({ ...CANDIDATE, halfLife: BigInt(draft.halfLife), decimals: draft.decimals }),
    [draft.halfLife, draft.decimals],
  );
  const terminal = useMemo(() => terminalOffset(schedule), [schedule]);
  const max = maxAtoms(schedule);

  const at = (blocks: bigint) => Number((cumulative(schedule, blocks) * 10000n) / max) / 10000;

  return (
    <Panel eyebrow="step 3" title="How fast does it all get issued?">
      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack-md">
          <Field
            label={`Half-life — ${group(draft.halfLife)} blocks (${blocksAsTime(draft.halfLife)})`}
            hint={faults.halfLife ?? "Half of everything is offered in this many blocks. Then half of what is left, and so on."}
          >
            <input
              type="range"
              min={36}
              max={4032}
              step={36}
              value={draft.halfLife}
              onChange={(e) => set("halfLife", Number(e.target.value))}
            />
          </Field>
          <Field label={`Decimals — ${draft.decimals}`} hint={faults.decimals}>
            <input
              type="range"
              min={0}
              max={12}
              value={draft.decimals}
              onChange={(e) => set("decimals", Number(e.target.value))}
            />
          </Field>

          <EmissionChart
            schedule={schedule}
            spanBlocks={BigInt(Math.max(3024, draft.halfLife * 6))}
            markers={MILESTONES.slice(0, 4).map((m) => ({ at: m.blocks, label: m.label }))}
            height={180}
          />
        </div>

        <Panel tight eyebrow="the consequence" title="Issuance milestones">
          <KV
            rows={[
              ["After 1 half-life", pct(at(BigInt(draft.halfLife)))],
              ["After 2", pct(at(BigInt(draft.halfLife * 2)))],
              ["After 3", pct(at(BigInt(draft.halfLife * 3)))],
              ["In 21 days (3,024 blk)", pct(at(3024n))],
              ["Max supply", `${atoms(max, draft.decimals, 0)}`],
              ["Issuance ends at", `${group(terminal)} blk · ${blocksAsTime(Number(terminal))}`],
            ]}
          />
          <div className="rule" />
          <Notice>
            Every figure is computed in exact integer arithmetic — no floating
            point anywhere in the schedule. The terminal block is where integer
            underflow ends issuance for good; there is no perpetual tail.
          </Notice>
          <div className="rule" />
          <p className="tiny faint" style={{ margin: 0 }}>
            Want to stress-test the reserve rule against turnout shapes? The{" "}
            <a href="#/lab">emission lab</a> runs the same maths with the
            dilution counterexample attached.
          </p>
        </Panel>
      </div>
    </Panel>
  );
}

function Commit({ draft }: { draft: LaunchDraft }) {
  const wallet = useWallet();
  const registry = useLaunchRegistry();
  const tip = useTip();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const preview = useMemo(
    () => commitmentFor(draft, wallet.vault?.identity ?? "", tip),
    [draft, wallet.vault?.identity, tip],
  );

  const commit = async () => {
    if (!wallet.vault) return;
    setBusy(true);
    setError(null);
    try {
      const commitment = await createLaunch(wallet.vault, draft, tip);
      registry.refresh();
      setCreated(commitment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Panel eyebrow="done" title={`${draft.symbol} is committed`}>
        <div className="row" style={{ gap: 14 }}>
          <Sigil symbol={draft.symbol} accent={draft.accent} size="lg" />
          <div>
            <p style={{ margin: 0 }}>
              Signed and published. It opens at height{" "}
              <span className="mono">{group(preview.h0)}</span> — in{" "}
              {blocksAsTime(draft.opensInBlocks)} — and appears in the launches
              grid now, marked as opening soon.
            </p>
          </div>
        </div>
        <div className="rule" />
        <div className="row">
          <button className="btn primary" onClick={() => navigate(`/launch/${created}`)}>
            Open {draft.symbol}
          </button>
          <button className="btn ghost" onClick={() => navigate("/")}>
            Back to launches
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel eyebrow="step 4" title="Check it, then sign it">
      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack-sm">
          <KV
            rows={[
              ["Symbol", draft.symbol],
              ["Name", draft.name],
              ["Opens at height", group(preview.h0)],
              ["Epoch length", `${draft.epochBlocks} blk · ${blocksAsTime(draft.epochBlocks)}`],
              ["Half-life", `${group(draft.halfLife)} blk`],
              ["Decimals", String(draft.decimals)],
              ["Ticket", `${group(draft.ticketSats)} sats`],
              ["Difficulty", `${draft.minClz} zero bits`],
            ]}
          />
          {!wallet.vault ? (
            <>
              <Notice tone="cyan">
                A launch is a signed commitment, so it needs a wallet key.
              </Notice>
              <a className="btn primary block" href="#/wallet">Connect a wallet</a>
            </>
          ) : (
            <button className="btn primary block lg" disabled={busy} onClick={() => void commit()}>
              {busy ? "Signing…" : `Commit ${draft.symbol}`}
            </button>
          )}
          {error && <Notice tone="warn">{error}</Notice>}
        </div>

        <Panel tight eyebrow="what signing does" title="And what it does not">
          <p className="tiny">
            Your key signs the symbol, the schedule, the ticket price and the
            opening height together. Anyone can then check that the launch they
            are mining is the one that was announced, and the index cannot alter
            a field without breaking the signature.
          </p>
          <Notice tone="warn">
            It does not put anything on Bitcoin. The commitment is published to
            the activity index and kept in your browser; a launch that is never
            published still exists for you, and one the index drops is not
            destroyed. On-chain launch registration is task{" "}
            <span className="mono">TC1</span>.
          </Notice>
          <div className="rule" />
          <div className="statrow">
            <Stat k="costs" v="0" unit="sats" small hint="Creating is free; mining it is not" />
            <Stat k="reversible" v="no" small tone="danger" />
          </div>
        </Panel>
      </div>
    </Panel>
  );
}

function humanSeconds(seconds: number): string {
  if (seconds < 1) return "under a second";
  if (seconds < 90) return `${seconds.toFixed(0)}s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
