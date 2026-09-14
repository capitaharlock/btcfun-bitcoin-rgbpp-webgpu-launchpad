/* Create your token.
 *
 * Three decisions, all about identity: what it is called and looks like, where
 * its ticket income goes, and when it opens. There is no economics step — every
 * token follows the same standard (`PROTOCOL.md` §4), so a creator cannot make
 * a token look scarce by picking a small number, and tokens stay comparable.
 *
 * The last step signs an announcement. It costs nothing: the mint script is
 * already on chain and permissionless, and the token comes into existence with
 * its first mint. A launch opens at a future height so that its creator cannot
 * mine it before anyone else has heard of it.
 */

import { useEffect, useMemo, useState } from "react";

import { navigate } from "../App";
import { useTip } from "../hooks/useLaunches";
import { ACCENTS, commitmentFor, createLaunch, slugFor, validate, type DraftFaults, type LaunchDraft } from "../lib/launches/create";
import { ACTIVE } from "../lib/bitcoin/network";
import { atoms, blocksAsTime, group, shortHash } from "../lib/format";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, PLATFORM_FEE_SATS, PROMOTER_SATS, reward, TICKET_SATS } from "../lib/standard";
import { useLaunchRegistry } from "../state/LaunchesProvider";
import { useWallet } from "../state/WalletProvider";
import { Chip, Field, KV, Notice, Panel, Stat } from "../ui/primitives";
import { Sigil } from "../ui/Sigil";

const ACCENT_LABELS: Record<(typeof ACCENTS)[number], string> = {
  "var(--amber)": "Amber",
  "var(--cyan)": "Cyan",
  "var(--magenta)": "Magenta",
  "var(--violet)": "Violet",
  "var(--mint)": "Mint",
  "var(--warn)": "Gold",
};

const STEPS = ["Identity", "Opening", "Announce"] as const;
type StepIndex = 0 | 1 | 2;

const INITIAL: LaunchDraft = {
  symbol: "",
  name: "",
  blurb: "",
  accent: "var(--amber)",
  promoter: "",
  opensInBlocks: 6,
};

/** Which draft fields each step is responsible for. */
const OWNED: Record<StepIndex, Array<keyof LaunchDraft>> = {
  0: ["symbol", "name", "blurb", "accent"],
  1: ["promoter", "opensInBlocks"],
  2: [],
};

/**
 * Where an unfinished draft waits. The last step sends a walletless visitor to
 * the wallet page, and a wizard that forgets everything they typed the moment
 * they follow its own advice is one nobody finishes. Session storage: a draft
 * belongs to this tab's attempt, not to the browser forever.
 */
const DRAFT_KEY = "btcfun:create-draft:v2";

interface SavedDraft {
  step: StepIndex;
  draft: LaunchDraft;
}

function loadDraft(): SavedDraft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Partial<SavedDraft> | null;
    if (!saved) return { step: 0, draft: INITIAL };
    return {
      step: ([0, 1, 2] as const).includes(saved.step as StepIndex) ? (saved.step as StepIndex) : 0,
      draft: { ...INITIAL, ...(saved.draft ?? {}) },
    };
  } catch {
    return { step: 0, draft: INITIAL };
  }
}

function forgetDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable: there was nothing to forget.
  }
}

export function Create() {
  const wallet = useWallet();
  const [initial] = useState(loadDraft);
  const [step, setStep] = useState<StepIndex>(initial.step);
  const [draft, setDraft] = useState<LaunchDraft>(initial.draft);
  const faults = useMemo(() => validate(draft), [draft]);

  // The promoter defaults to the creator's own address once a wallet exists,
  // without overwriting an address the creator typed.
  useEffect(() => {
    if (wallet.vault && !draft.promoter) setDraft((d) => ({ ...d, promoter: wallet.vault!.address }));
  }, [wallet.vault, draft.promoter]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, draft } satisfies SavedDraft));
    } catch {
      // Private mode or full storage: the wizard still works, it just forgets.
    }
  }, [step, draft]);

  const set = <K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const clean = (index: StepIndex) => OWNED[index].every((field) => !faults[field]);
  const reachable = (index: StepIndex) => ([0, 1] as StepIndex[]).slice(0, index).every(clean);

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
        <Chip tone="cyan">{ACTIVE.label}</Chip>
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
          {step === 1 && <Opening draft={draft} faults={faults} set={set} />}
          {step === 2 && <Announce draft={draft} />}

          {step < 2 && (
            <div className="row">
              {step > 0 && (
                <button className="btn ghost" onClick={() => setStep((s) => (s - 1) as StepIndex)}>
                  ← Back
                </button>
              )}
              <span className="spacer" />
              <button className="btn primary lg" disabled={!clean(step)} onClick={() => setStep((s) => (s + 1) as StepIndex)}>
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
            <input className="input" placeholder="Meshwork" maxLength={40} value={draft.name} onChange={(e) => set("name", e.target.value)} />
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
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  aria-label={ACCENT_LABELS[accent]}
                  aria-pressed={draft.accent === accent}
                  onClick={() => set("accent", accent)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    cursor: "pointer",
                    background: accent,
                    border: draft.accent === accent ? "2px solid var(--ink)" : "1px solid var(--line-strong)",
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
          <p className="tiny" style={{ margin: 0 }}>{draft.blurb || "One sentence that tells someone what this is for."}</p>
          <div className="rule" />
          <div className="tiny faint">
            URL: <span className="mono">/launch/{slugFor(draft.symbol) || "symbol"}-…</span>
            <br />
            The suffix is the start of the token's own id on CKB, which is fixed by what you choose here
            and on the next step. No two launches can share it.
          </div>
        </Panel>
      </div>
    </Panel>
  );
}

function Opening({ draft, faults, set }: StepProps) {
  const tip = useTip();
  return (
    <Panel eyebrow="step 2" title="Where the income goes, and when it opens">
      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack-sm">
          <Field label="Ticket income to" hint={faults.promoter ?? "Every ticket pays this Bitcoin address. It is part of the token's identity and cannot change."}>
            <input
              className="input mono"
              placeholder={`${ACTIVE.addressPrefix}…`}
              spellCheck={false}
              value={draft.promoter}
              onChange={(e) => set("promoter", e.target.value.trim())}
            />
          </Field>
          <Field label="Opens in (blocks)" hint={faults.opensInBlocks ?? `About ${blocksAsTime(draft.opensInBlocks)}. It must open at a future block, so nobody can mine it before it is announced.`}>
            <input
              className="input"
              type="number"
              min={1}
              max={1008}
              value={draft.opensInBlocks}
              onChange={(e) => set("opensInBlocks", Math.max(1, Number(e.target.value) | 0))}
            />
          </Field>
        </div>

        <Panel tight eyebrow="the standard" title="What you do not choose">
          <KV
            rows={[
              ["Ticket", `${group(TICKET_SATS)} sats: ${group(PROMOTER_SATS)} to your address, ${group(PLATFORM_FEE_SATS)} to the platform`],
              ["Reward", `1 token × clz² ÷ 2^halvings, from ${MIN_CLZ} bits`],
              ["First week, 24-bit hash", `${atoms(reward(24, 0, 0), DECIMALS, 0)} tokens`],
              ["Halving", `every ${group(HALVING_BLOCKS)} blocks (about a week)`],
              ["Supply", "no cap; the halvings end it"],
              ["Opens at", tip ? `block ${group(tip + draft.opensInBlocks)}` : "—"],
            ]}
          />
          <div className="rule" />
          <Notice tone="cyan">
            A small launch sells few tickets and issues little; a popular one sells more and issues more.
            The rules are the same for everyone, so the numbers are comparable.
          </Notice>
        </Panel>
      </div>
    </Panel>
  );
}

function Announce({ draft }: { draft: LaunchDraft }) {
  const wallet = useWallet();
  const registry = useLaunchRegistry();
  const tip = useTip();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const preview = useMemo(() => {
    try {
      return commitmentFor(draft, wallet.vault?.identity ?? "", tip);
    } catch {
      return null;
    }
  }, [draft, wallet.vault?.identity, tip]);

  const announce = async () => {
    if (!wallet.vault) return;
    setBusy(true);
    setError(null);
    try {
      const commitment = await createLaunch(wallet.vault, draft, tip);
      registry.refresh();
      forgetDraft();
      setCreated(commitment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (created && preview) {
    return (
      <Panel eyebrow="done" title={`${draft.symbol} is announced`}>
        <div className="row" style={{ gap: 14 }}>
          <Sigil symbol={draft.symbol} accent={draft.accent} size="lg" />
          <p style={{ margin: 0 }}>
            Signed and published. It opens at block <span className="mono">{group(preview.h0)}</span> — in about{" "}
            {blocksAsTime(draft.opensInBlocks)} — and its token id is{" "}
            <span className="mono">{shortHash(preview.tokenId, 10, 6)}</span>.
          </p>
        </div>
        <div className="rule" />
        <div className="row">
          <button className="btn primary" onClick={() => navigate(`/launch/${created}`)}>Open {draft.symbol}</button>
          <button className="btn ghost" onClick={() => navigate("/")}>Back to launches</button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel eyebrow="step 3" title="Check it, then sign it">
      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack-sm">
          <KV
            rows={[
              ["Symbol", draft.symbol],
              ["Name", draft.name],
              ["Ticket income to", shortHash(draft.promoter, 12, 8)],
              ["Opens at block", preview ? group(preview.h0) : "—"],
              ["Token id", preview ? <span className="mono">{shortHash(preview.tokenId, 10, 6)}</span> : "—"],
            ]}
          />
          {!wallet.vault ? (
            <>
              <Notice tone="cyan">An announcement is signed, so it needs a wallet key.</Notice>
              <a className="btn primary block" href="#/wallet">Connect a wallet</a>
            </>
          ) : (
            <button className="btn primary block lg" disabled={busy || !preview} onClick={() => void announce()}>
              {busy ? "Signing…" : `Announce ${draft.symbol}`}
            </button>
          )}
          {error && <Notice tone="warn">{error}</Notice>}
        </div>

        <Panel tight eyebrow="what signing does" title="And what it does not">
          <p className="tiny">
            Your key signs the name, the income address and the opening height together, and the token id
            is derived from them. Anyone can check that the token they mine is the one announced; the
            index cannot change a field without breaking the signature and the id.
          </p>
          <Notice>
            Nothing is written to Bitcoin or CKB now. The mint script is already deployed; the token
            appears on chain with its first mint.
          </Notice>
          <div className="rule" />
          <div className="statrow">
            <Stat k="costs" v="0" unit="sats" small hint="Announcing is free; tickets are paid by miners" />
            <Stat k="reversible" v="no" small tone="danger" />
          </div>
        </Panel>
      </div>
    </Panel>
  );
}
