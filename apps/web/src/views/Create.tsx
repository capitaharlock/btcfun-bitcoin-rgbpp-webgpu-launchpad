/* Create your token.
 *
 * Four steps, all about identity: what it is called and looks like, where its
 * ticket income goes and when it opens, where the project lives and why it
 * raises funds, and the signature. There is no economics step — every token
 * follows the same standard (`PROTOCOL.md` §4), so a creator cannot make a
 * token look scarce by picking a small number, and tokens stay comparable.
 *
 * The last step signs an announcement. It costs nothing: the mint script is
 * already on chain and permissionless, and the token comes into existence with
 * its first mint. A launch opens at a future height so that its creator cannot
 * mine it before anyone else has heard of it. Links, story and picture are
 * part of the signed announcement but not of the token: they never change its
 * id, and nothing on chain enforces them.
 */

import { useEffect, useMemo, useState } from "react";

import { navigate } from "../App";
import { useTip } from "../hooks/useLaunches";
import {
  ACCENTS,
  commitmentFor,
  createLaunch,
  extrasOf,
  LINK_KINDS,
  MAX_STORY_LENGTH,
  NO_LINKS,
  NO_STORY,
  slugFor,
  validate,
  type DraftFaults,
  type DraftField,
  type LaunchDraft,
  type LinkKind,
  type StoryPart,
} from "../lib/launches/create";
import { imageFor } from "../lib/launches/image";
import { ACTIVE } from "../lib/bitcoin/network";
import { atoms, blocksAsTime, group, shortHash } from "../lib/format";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, NEW_CELL, REUSE, reward, TICKET_SATS } from "../lib/standard";
import { useLaunchRegistry } from "../state/LaunchesProvider";
import { useWallet } from "../state/WalletProvider";
import { LINK_LABEL, ProjectLinks } from "../ui/PixelIcon";
import { Chip, Field, KV, More, Notice, PageHead, Panel, Stat } from "../ui/primitives";
import { Sigil } from "../ui/Sigil";
import { TokenImage } from "../ui/TokenImage";

const ACCENT_LABELS: Record<(typeof ACCENTS)[number], string> = {
  "var(--amber)": "Amber",
  "var(--cyan)": "Cyan",
  "var(--magenta)": "Magenta",
  "var(--violet)": "Violet",
  "var(--mint)": "Mint",
  "var(--warn)": "Gold",
};

const STEPS = ["Identity", "Opening", "Project", "Announce"] as const;
type StepIndex = 0 | 1 | 2 | 3;
const LAST: StepIndex = 3;

const INITIAL: LaunchDraft = {
  symbol: "",
  name: "",
  blurb: "",
  accent: "var(--amber)",
  promoter: "",
  opensInBlocks: 6,
  links: NO_LINKS,
  story: NO_STORY,
  image: "",
};

/** Which draft fields each step is responsible for. */
const OWNED: Record<StepIndex, DraftField[]> = {
  0: ["symbol", "name", "blurb", "accent"],
  1: ["promoter", "opensInBlocks"],
  2: [...LINK_KINDS.map((k) => `links.${k}` as const), "story.why", "story.plan", "image", "extras"],
  3: [],
};

const LINK_PLACEHOLDER: Record<LinkKind, string> = {
  website: "https://…",
  x: "@handle",
  telegram: "https://t.me/…",
  discord: "https://discord.gg/…",
  github: "https://github.com/…",
};

const STORY_LABEL: Record<StoryPart, { label: string; placeholder: string }> = {
  why: { label: "Why", placeholder: "Why this launch raises funds." },
  plan: { label: "The plan", placeholder: "What the community will do with them." },
};

/**
 * Where an unfinished draft waits. The last step sends a walletless visitor to
 * the wallet page, and a wizard that forgets everything they typed the moment
 * they follow its own advice is one nobody finishes. Session storage: a draft
 * belongs to this tab's attempt, not to the browser forever.
 */
const DRAFT_KEY = "btcfun:create-draft:v3";

interface SavedDraft {
  step: StepIndex;
  draft: LaunchDraft;
}

function loadDraft(): SavedDraft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Partial<SavedDraft> | null;
    if (!saved) return { step: 0, draft: INITIAL };
    return {
      step: ([0, 1, 2, 3] as const).includes(saved.step as StepIndex) ? (saved.step as StepIndex) : 0,
      draft: {
        ...INITIAL,
        ...(saved.draft ?? {}),
        links: { ...NO_LINKS, ...(saved.draft?.links ?? {}) },
        story: { ...NO_STORY, ...(saved.draft?.story ?? {}) },
      },
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
  const reachable = (index: StepIndex) => ([0, 1, 2] as StepIndex[]).slice(0, index).every(clean);

  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="create"
        title={
          <>
            Launch your own <span className="hl">token</span>
          </>
        }
        lede="Free to announce. Same rules as every launch."
        aside={<Chip tone="cyan">{ACTIVE.label}</Chip>}
      />

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
          {step === 2 && <Project draft={draft} faults={faults} set={set} />}
          {step === LAST && <Announce draft={draft} />}

          {step < LAST && (
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

/** The id the draft would get if signed now: what its sprite is drawn from. */
function usePreviewId(draft: LaunchDraft): string {
  const wallet = useWallet();
  const tip = useTip();
  return useMemo(() => {
    try {
      return commitmentFor(draft, wallet.vault?.identity ?? "", tip).id;
    } catch {
      return `draft:${draft.symbol}`;
    }
  }, [draft, wallet.vault?.identity, tip]);
}

function Identity({ draft, faults, set }: StepProps) {
  const seed = usePreviewId(draft);
  return (
    <Panel eyebrow="step 1" title="What is it called?">
      <div className="split">
        <div className="stack-sm">
          <Field label="Symbol" hint={faults.symbol ?? "2–8 characters. Part of the URL."}>
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
            <div className="row wrapped">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  className="swatch"
                  aria-label={ACCENT_LABELS[accent]}
                  aria-pressed={draft.accent === accent}
                  onClick={() => set("accent", accent)}
                  style={{ "--swatch": accent } as React.CSSProperties}
                />
              ))}
            </div>
          </Field>
        </div>

        <Panel tight eyebrow="preview" title="Your invader">
          <div className="row">
            <Sigil seed={seed} accent={draft.accent} size="lg" />
            <div className="stack-sm">
              <div className="tc-sym">{draft.symbol || "SYMBOL"}</div>
              <div className="tiny faint">{draft.name || "Your token's name"}</div>
            </div>
          </div>
          <div className="rule" />
          <p className="tiny clamp">{draft.blurb || "One sentence that tells someone what this is for."}</p>
          <More summary="About the sprite and the URL">
            <p>
              The sprite is drawn from the token's id, which your name, sentence, income address and opening block fix; it
              is final when you sign. URL: <span className="mono">/launch/{slugFor(draft.symbol) || "symbol"}-…</span>, the
              suffix being the start of that id. No two launches can share it.
            </p>
          </More>
        </Panel>
      </div>
    </Panel>
  );
}

function Opening({ draft, faults, set }: StepProps) {
  const tip = useTip();
  return (
    <Panel eyebrow="step 2" title="Income and opening">
      <div className="split">
        <div className="stack-sm">
          <Field label="Ticket income to" hint={faults.promoter ?? "Paid by every ticket. Permanent."}>
            <input
              className="input mono"
              placeholder={`${ACTIVE.addressPrefix}…`}
              spellCheck={false}
              value={draft.promoter}
              onChange={(e) => set("promoter", e.target.value.trim())}
            />
          </Field>
          <Field label="Opens in (blocks)" hint={faults.opensInBlocks ?? `About ${blocksAsTime(draft.opensInBlocks)}.`}>
            <input
              className="input"
              type="number"
              min={1}
              max={1008}
              value={draft.opensInBlocks}
              onChange={(e) => set("opensInBlocks", Math.max(1, Number(e.target.value) | 0))}
            />
          </Field>
          <More>
            <p>A launch opens at a future block, so nobody — you included — can mine it before it is announced.</p>
          </More>
        </div>

        <Panel tight eyebrow="the standard" title="What you do not choose">
          <KV
            rows={[
              ["Ticket", `${group(TICKET_SATS)} sats: ${group(REUSE.promoter)} to your address and ${group(REUSE.platform)} to the platform; ${group(NEW_CELL.promoter)} and ${group(NEW_CELL.platform)} when ${group(NEW_CELL.paymaster)} pay for a new miner cell`],
              ["Reward", `1 token × clz² ÷ 2^halvings, from ${MIN_CLZ} bits`],
              ["First week, 24-bit hash", `${atoms(reward(24, 0, 0), DECIMALS, 0)} tokens`],
              ["Halving", `every ${group(HALVING_BLOCKS)} blocks (about a week)`],
              ["Opens at", tip ? `block ${group(tip + draft.opensInBlocks)}` : "—"],
            ]}
          />
        </Panel>
      </div>
    </Panel>
  );
}

function Project({ draft, faults, set }: StepProps) {
  const setLink = (kind: LinkKind, value: string) => set("links", { ...draft.links, [kind]: value });
  const setStory = (part: StoryPart, value: string) => set("story", { ...draft.story, [part]: value });
  const picture = imageFor(draft.image);
  return (
    <Panel eyebrow="step 3 · optional" title="Links, story and picture">
      <div className="stack-md">
        <div className="row">
          <TokenImage art={picture ? { src: picture, by: "creator" } : null} seed={draft.symbol || "draft"} accent={draft.accent} symbol={draft.symbol || "Your"} size="lg" />
          <div className="grow">
            <Field label="Image" hint={faults.image ?? "A square picture: an https:// address, or one of this site's under /tokens/."}>
              <input
                className="input"
                inputMode="url"
                spellCheck={false}
                placeholder="https://…/token.png"
                value={draft.image}
                onChange={(e) => set("image", e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="grid g3">
          {LINK_KINDS.map((kind) => (
            <Field key={kind} label={LINK_LABEL[kind]} hint={faults[`links.${kind}`]}>
              <input
                className="input"
                inputMode="url"
                spellCheck={false}
                placeholder={LINK_PLACEHOLDER[kind]}
                value={draft.links[kind]}
                onChange={(e) => setLink(kind, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <div className="grid g2">
          {(["why", "plan"] as const).map((part) => (
            <Field
              key={part}
              label={STORY_LABEL[part].label}
              hint={faults[`story.${part}`] ?? `${draft.story[part].length}/${MAX_STORY_LENGTH}`}
            >
              <textarea
                className="input"
                maxLength={MAX_STORY_LENGTH}
                placeholder={STORY_LABEL[part].placeholder}
                value={draft.story[part]}
                onChange={(e) => setStory(part, e.target.value)}
              />
            </Field>
          ))}
        </div>
        {faults.extras && <Notice tone="warn">{faults.extras}</Notice>}
        <p className="tiny faint clamp">Signed by you with the announcement and shown on the launch page. Not enforced on chain.</p>
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
  const extras = extrasOf(draft);

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
        <div className="row">
          <Sigil seed={created} accent={draft.accent} size="lg" />
          <p className="clamp">
            Opens at block <span className="mono">{group(preview.h0)}</span>, in about {blocksAsTime(draft.opensInBlocks)}.
          </p>
        </div>
        <div className="rule" />
        <div className="row wrapped">
          <button className="btn primary" onClick={() => navigate(`/launch/${created}`)}>Open {draft.symbol}</button>
          <button className="btn ghost" onClick={() => navigate("/")}>Back to launches</button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel eyebrow="step 4" title="Check it, then sign it">
      <div className="split">
        <div className="stack-sm">
          <KV
            rows={[
              ["Symbol", draft.symbol],
              ["Name", draft.name],
              ["Ticket income to", shortHash(draft.promoter, 12, 8)],
              ["Opens at block", preview ? group(preview.h0) : "—"],
              ["Token id", preview ? <span className="mono">{shortHash(preview.tokenId, 10, 6)}</span> : "—"],
              ["Story", extras.story ? `${Object.keys(extras.story).length} of 2 parts` : "none"],
              ["Image", extras.image ? <span className="mono" title={extras.image}>{shortHash(extras.image, 24, 10)}</span> : "none"],
            ]}
          />
          {extras.links && <ProjectLinks links={extras.links} symbol={draft.symbol} small />}
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

        <Panel tight eyebrow="what signing does" title="Free, and final">
          <div className="statrow">
            <Stat k="costs" v="0" unit="sats" small hint="Announcing is free; tickets are paid by miners" />
            <Stat k="reversible" v="no" small tone="danger" />
          </div>
          <More>
            <p>
              Your key signs everything above together. The token id is derived from all of it except the links, the
              story and the image, which never change it. The index cannot alter a field without breaking the signature.
            </p>
            <p>Nothing is written to Bitcoin or CKB now. The mint script is already deployed; the token appears with its first mint.</p>
          </More>
        </Panel>
      </div>
    </Panel>
  );
}
