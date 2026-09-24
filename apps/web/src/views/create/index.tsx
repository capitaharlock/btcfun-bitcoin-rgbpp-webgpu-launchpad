/* Create your token.
 *
 * Five steps. Three are about identity: what it is called and looks like,
 * where its ticket income goes and when it opens, where the project lives and
 * why it raises funds. There is no economics step — every token follows the
 * same standard (`PROTOCOL.md` §4), so a creator cannot make a token look
 * scarce by picking a small number, and tokens stay comparable.
 *
 * The fourth registers and announces the launch behind one button: one Bitcoin
 * payment of `REGISTRATION_SATS` to the platform, btc.fun's certificate over
 * the terms and that payment's txid — the mint script takes tickets only for
 * terms certified that way (`lib/launches/certificate.ts`) — and the signed
 * announcement. The payment is kept on the device the moment it is sent, so
 * nothing here ever pays twice, and nothing waits for a confirmation. The
 * fifth is the summary: what the launch rests on, and its mint page.
 *
 * A launch opens at a future height so that its creator cannot mine it before
 * anyone else has heard of it. Links, story and picture are part of the signed
 * announcement but not of the token: they never change its id, and nothing on
 * chain enforces them.
 *
 * The income step shows, beside the address it pays, what a launch earns: the
 * ticket share, the fee, and what a given number of tickets a day comes to.
 * The whole wizard fits one laptop screen, its actions always in the bar at
 * the bottom of the card.
 */

import { useEffect, useMemo, useState } from "react";

import { navigate } from "../App";
import { useTip } from "../hooks/useLaunches";
import {
  ACCENTS,
  certify,
  createLaunch,
  payRegistration,
  pendingRegistration,
  type LaunchCommitment,
  type Registration,
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
import { InsufficientFunds } from "../lib/bitcoin";
import { ACTIVE, txUrl } from "../lib/bitcoin/network";
import { estimateVsize, opReturnScriptBytes, P2WPKH_SCRIPT_BYTES } from "../lib/bitcoin/payment";
import { fastFeeRate } from "../lib/bitcoin/provider";
import { atoms, blocksAsTime, btc, group, shortHash } from "../lib/format";
import { REGISTRATION_SATS } from "../lib/launches/certificate";
import { plainFunding } from "../lib/rgbpp/bitcoin";
import { DECIMALS, HALVING_BLOCKS, MIN_CLZ, NEW_CELL, PLATFORM_PERCENT, REUSE, reward, TICKET_SATS } from "../lib/standard";
import { useLaunchRegistry } from "../state/LaunchesProvider";
import { landingTxids, useTokens } from "../state/TokensProvider";
import { NETWORK, useWallet } from "../state/WalletProvider";
import { LINK_LABEL, PixelIcon, ProjectLinks } from "../ui/PixelIcon";
import { Chip, Field, KV, More, Notice, PageHead, Panel } from "../ui/primitives";
import "./create.css";
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

const STEPS = ["Identity", "Income", "Project", "Register", "Launched"] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;
const REGISTER: StepIndex = 3;
const LAUNCHED: StepIndex = 4;

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
  4: [],
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
      // The summary is never restored: the draft is forgotten once announced.
      step: ([0, 1, 2, 3] as const).includes(saved.step as 0) ? (saved.step as StepIndex) : 0,
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
  const valid = Object.keys(faults).length === 0;
  // A registration already paid for exactly this draft — in this visit or an
  // earlier one. Once it exists the terms are fixed: going back to edit them
  // would make a different launch, one the payment does not cover. Only a
  // valid draft has terms to look one up by.
  const stored = useMemo(() => (valid ? pendingRegistration(draft) : null), [draft, valid]);
  const [paid, setPaid] = useState<Registration | null>(null);
  const registration = paid ?? stored;
  const [launched, setLaunched] = useState<LaunchCommitment | null>(null);

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

  // Every step starts at the top of the form, wherever the last one was left.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const set = <K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const clean = (index: StepIndex) => OWNED[index].every((field) => !faults[field]);
  const reachable = (index: StepIndex) =>
    launched ? index === LAUNCHED : registration ? index === REGISTER : index < LAUNCHED && ([0, 1, 2] as StepIndex[]).slice(0, index).every(clean);
  const back = step > 0 && step < LAUNCHED && !registration ? () => setStep((s) => (s - 1) as StepIndex) : null;

  return (
    <div className="cr-page">
      <PageHead
        eyebrow="create"
        title={
          <>
            Launch your own <span className="hl">token</span>
          </>
        }
        lede={`One registration of ${group(REGISTRATION_SATS)} sats, then every ticket pays you. Same rules as every launch.`}
        aside={<Chip tone="cyan">{ACTIVE.label}</Chip>}
      />

      <section className="cw" aria-label="Create a launch">
        <nav className="cw-steps" aria-label="Steps">
          {STEPS.map((label, i) => {
            const index = i as StepIndex;
            const done = index < step;
            return (
              <button
                key={label}
                type="button"
                className={step === index ? "on" : done ? "done" : ""}
                aria-label={label}
                aria-current={step === index ? "step" : undefined}
                disabled={!reachable(index)}
                onClick={() => setStep(index)}
              >
                <span className="num">{done ? "✓" : i + 1}</span>
                <span className="cw-label">{label}</span>
              </button>
            );
          })}
        </nav>

        {step === LAUNCHED && launched ? (
          <Launched launch={launched} />
        ) : step >= REGISTER ? (
          <Register
            draft={draft}
            registration={registration}
            onPaid={setPaid}
            onLaunched={(commitment) => {
              setLaunched(commitment);
              setStep(LAUNCHED);
            }}
            back={back}
          />
        ) : (
          <>
            <div className="cw-body">
              {step === 0 && <Identity draft={draft} faults={faults} set={set} />}
              {step === 1 && <Income draft={draft} faults={faults} set={set} />}
              {step === 2 && <Project draft={draft} faults={faults} set={set} />}
            </div>
            <Bar step={step} back={back}>
              <button className="btn primary lg" disabled={!clean(step)} onClick={() => setStep((s) => (s + 1) as StepIndex)}>
                Continue →
              </button>
            </Bar>
          </>
        )}
      </section>
    </div>
  );
}

/** What the next step is, said on the bar next to the button that goes there. */
const NEXT: Record<StepIndex, string> = {
  0: "Next: where your income goes",
  1: "Next: picture, links and story",
  2: "Next: register and announce",
  3: "Next: your launch's summary",
  4: "Done",
};

/**
 * The wizard's footer: back on the left, the one action that moves forward on
 * the right, always in the same place whatever the step holds.
 */
function Bar({ step, back, children }: { step: StepIndex; back: (() => void) | null; children: React.ReactNode }) {
  return (
    <footer className="cw-bar">
      {back ? (
        <button className="btn ghost" onClick={back}>
          ← Back
        </button>
      ) : (
        <span />
      )}
      <span className="cw-where">
        Step {step + 1} of {STEPS.length} · {NEXT[step]}
      </span>
      <div className="cw-go">{children}</div>
    </footer>
  );
}

/** A step's own heading inside the wizard's card. */
function StepHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="cw-head">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
    </header>
  );
}

interface StepProps {
  draft: LaunchDraft;
  faults: DraftFaults;
  set: <K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) => void;
}

/**
 * What the draft's sprite is drawn from until it is registered. The final
 * sprite comes from the token id, which includes the registration and the
 * certificate, so it exists only once the launch is registered.
 */
function previewSeed(draft: LaunchDraft): string {
  return `draft:${draft.symbol}:${draft.name}`;
}

function Identity({ draft, faults, set }: StepProps) {
  const seed = previewSeed(draft);
  return (
    <>
      <StepHead eyebrow="step 1 of 5" title="What is it called?" />
      <div className="split">
        <div className="stack-sm">
          <div className="grid g2">
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
          </div>
          <Field label="One sentence" hint={faults.blurb ?? `${draft.blurb.length}/160`}>
            <textarea
              className="input"
              rows={2}
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
              The sprite is drawn from the token's id, which your name, sentence, income address, opening block and
              registration fix; this one is a preview, and the final one appears when the launch is registered. URL: <span className="mono">/launch/{slugFor(draft.symbol) || "symbol"}-…</span>, the
              suffix being the start of that id. No two launches can share it.
            </p>
          </More>
        </Panel>
      </div>
    </>
  );
}

/** Where the income goes and when it starts — beside what that income is. */
function Income({ draft, faults, set }: StepProps) {
  const tip = useTip();
  return (
    <>
      <StepHead eyebrow="step 2 of 5" title="Where your income goes, and when it opens" />
      <div className="cr-income">
        <div className="stack-sm">
          <Field label="Ticket income to" hint={faults.promoter ?? "Permanent."}>
            <input
              className="input mono"
              placeholder={`${ACTIVE.addressPrefix}…`}
              spellCheck={false}
              value={draft.promoter}
              onChange={(e) => set("promoter", e.target.value.trim())}
            />
          </Field>
          <Field
            label="Opens in (blocks)"
            hint={faults.opensInBlocks ?? `About ${blocksAsTime(draft.opensInBlocks)}${tip ? ` — block ${group(tip + draft.opensInBlocks)}` : ""}.`}
          >
            <input
              className="input"
              type="number"
              min={1}
              max={1008}
              value={draft.opensInBlocks}
              onChange={(e) => set("opensInBlocks", Math.max(1, Number(e.target.value) | 0))}
            />
          </Field>
          <p className="tiny faint clamp">
            A launch opens at a future block, so nobody — you included — can mine it before it is announced. You choose
            the name and the address, never the price, the supply or the reward: every launch follows the same rules,
            so every token is comparable.
          </p>
        </div>
        <Earnings />
      </div>
    </>
  );
}

function Project({ draft, faults, set }: StepProps) {
  const setLink = (kind: LinkKind, value: string) => set("links", { ...draft.links, [kind]: value });
  const setStory = (part: StoryPart, value: string) => set("story", { ...draft.story, [part]: value });
  const picture = imageFor(draft.image);
  const row = (kind: LinkKind | "image", label: string, fault: string | undefined, icon: React.ReactNode, input: React.ReactNode) => (
    <label key={kind} className={`cr-link${fault ? " bad" : ""}`}>
      <span className="cr-link-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="cr-link-name">
        {label}
        {fault && <span className="cr-link-fault"> · {fault}</span>}
      </span>
      {input}
    </label>
  );
  return (
    <>
      <StepHead eyebrow="step 3 of 5 · optional" title="Picture, links and story" />
      <div className="cr-project">
        <div className="cr-links">
          {row(
            "image",
            "Image address",
            faults.image,
            <TokenImage art={picture ? { src: picture, by: "creator" } : null} seed={draft.symbol || "draft"} accent={draft.accent} symbol={draft.symbol || "Your"} size="sm" />,
            <input
              className="input"
              inputMode="url"
              spellCheck={false}
              placeholder="https://…/token.png — square"
              value={draft.image}
              onChange={(e) => set("image", e.target.value)}
            />,
          )}
          {LINK_KINDS.map((kind) =>
            row(
              kind,
              LINK_LABEL[kind],
              faults[`links.${kind}`],
              <PixelIcon kind={kind} />,
              <input
                className="input"
                inputMode="url"
                spellCheck={false}
                placeholder={LINK_PLACEHOLDER[kind]}
                value={draft.links[kind]}
                onChange={(e) => setLink(kind, e.target.value)}
              />,
            ),
          )}
        </div>

        <section className="cr-story" aria-label="Story">
          <h3>Explain the why and the plan</h3>
          <div className="grid g2">
            {(["why", "plan"] as const).map((part) => (
              <Field
                key={part}
                label={STORY_LABEL[part].label}
                hint={faults[`story.${part}`] ?? `${draft.story[part].length}/${MAX_STORY_LENGTH}`}
              >
                <textarea
                  className="input"
                  rows={3}
                  maxLength={MAX_STORY_LENGTH}
                  placeholder={STORY_LABEL[part].placeholder}
                  value={draft.story[part]}
                  onChange={(e) => setStory(part, e.target.value)}
                />
              </Field>
            ))}
          </div>
        </section>
        {faults.extras && <Notice tone="warn">{faults.extras}</Notice>}
      </div>
    </>
  );
}

/** The registration's network fee: one plain input, the platform, the commitment, change. */
function registrationFee(feeRate: number): number {
  return Math.ceil(estimateVsize(1, [P2WPKH_SCRIPT_BYTES, opReturnScriptBytes(32), P2WPKH_SCRIPT_BYTES]) * feeRate);
}

/** Where the one registering action stands while it runs. */
type Phase = "paying" | "certifying" | "announcing";

const PHASE_LABEL: Record<Phase, string> = {
  paying: "Paying the registration…",
  certifying: "Waiting for Bitcoin to see the payment…",
  announcing: "Signing the announcement…",
};

interface RegisterProps {
  draft: LaunchDraft;
  registration: Registration | null;
  onPaid: (paid: Registration) => void;
  onLaunched: (launch: LaunchCommitment) => void;
  back: (() => void) | null;
}

/**
 * Pay, certify and announce behind one button. The payment is the only step
 * that asks anything of the creator; the certificate follows from it (asked
 * for again while Bitcoin's explorers have not seen the payment) and the
 * announcement is a signature with the same key. A registration paid earlier
 * resumes at the certificate and never pays twice.
 */
function Register({ draft, registration, onPaid, onLaunched, back }: RegisterProps) {
  const wallet = useWallet();
  const tokens = useTokens();
  const registry = useLaunchRegistry();
  const tip = useTip();
  const [certificate, setCertificate] = useState<string | null>(null);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const extras = extrasOf(draft);

  useEffect(() => {
    let live = true;
    void fastFeeRate().then((rate) => live && setFeeRate(rate));
    return () => {
      live = false;
    };
  }, []);

  const fee = feeRate === null ? null : registrationFee(feeRate);
  const total = fee === null ? null : REGISTRATION_SATS + fee;
  const spendable = wallet.balance
    ? plainFunding(wallet.balance.utxos, landingTxids(tokens.operations)).reduce((n, u) => n + u.value, 0)
    : null;
  const short = !registration && total !== null && spendable !== null && spendable < total;
  const h0 = registration?.h0 ?? (tip ? tip + draft.opensInBlocks : null);

  const run = async () => {
    const vault = wallet.vault;
    if (!vault || !tip || feeRate === null) return;
    setError(null);
    try {
      let paid = registration;
      if (!paid) {
        setPhase("paying");
        const free = await tokens.service.freeUtxos(vault.address);
        const utxos = plainFunding(free, landingTxids(tokens.operations));
        paid = await payRegistration(vault, draft, tip + draft.opensInBlocks, utxos, feeRate, (hex) => tokens.service.broadcast(hex));
        onPaid(paid);
        void wallet.refresh();
      }
      let cert = certificate;
      if (!cert) {
        setPhase("certifying");
        cert = await certify(draft, paid);
        setCertificate(cert);
      }
      setPhase("announcing");
      const commitment = await createLaunch(vault, draft, paid, cert);
      registry.refresh();
      forgetDraft();
      onLaunched(commitment);
    } catch (err) {
      setError(err instanceof InsufficientFunds ? "Not enough bitcoin for the registration and its network fee." : err instanceof Error ? err.message : String(err));
    } finally {
      setPhase(null);
    }
  };

  const stage = !registration ? 1 : certificate ? 3 : 2;
  const action = !wallet.vault ? (
    <a className="btn primary lg" href="#/wallet">Connect a wallet</a>
  ) : phase ? (
    <button className="btn lg working" disabled aria-busy="true">
      {PHASE_LABEL[phase]}
    </button>
  ) : registration ? (
    <button className="btn primary lg" onClick={() => void run()}>
      {error ? "Try again" : "Finish"} · launch {draft.symbol}, already paid
    </button>
  ) : (
    <button className="btn primary lg" disabled={total === null || short} onClick={() => void run()}>
      {total === null ? "Pricing…" : `Pay ${group(total)} sats & launch ${draft.symbol}`}
    </button>
  );

  return (
    <>
      <div className="cw-body">
        <StepHead eyebrow="step 4 of 5" title="Register it and announce it — one signature" />
        <div className="split">
          <div className="stack-sm">
            <KV
              rows={[
                ["Symbol", draft.symbol],
                ["Name", draft.name],
                ["Ticket income to", shortHash(draft.promoter, 12, 8)],
                ["Opens at block", h0 ? group(h0) : "—"],
                ["Story", extras.story ? `${Object.keys(extras.story).length} of 2 parts` : "none"],
                ["Image", extras.image ? <span className="mono" title={extras.image}>{shortHash(extras.image, 24, 10)}</span> : "none"],
              ]}
            />
            {extras.links && <ProjectLinks links={extras.links} symbol={draft.symbol} small />}
            <More summary="What registering guarantees">
              <p>
                The payment commits to this launch's terms, so it pays for this launch only. btc.fun checks it and signs the
                terms together with the payment's txid; the mint script on CKB refuses tickets for any terms it has not
                signed that way, so {draft.symbol || "your token"} exists only as launched here, and anyone can check the
                certificate and the payment it names. The registration is kept on this device the moment it is sent: a
                reload continues it and never pays twice.
              </p>
              <p>Not refundable. Once paid, nothing above can change: a different field would be a different token.</p>
            </More>
          </div>

          <div className="cr-register">
            <ol className="cr-stages">
              <li className={stage > 1 ? "done" : phase === "paying" ? "on" : ""}>
                <b>1 · Pay the registration</b>
                <span data-paying-from={wallet.vault?.address}>
                  {group(REGISTRATION_SATS)} sats to btc.fun, once{fee !== null ? ` + ${group(fee)} sats network fee` : ""}
                  {wallet.vault ? `, from ${shortHash(wallet.vault.address, 8, 6)}` : ""}.
                </span>
                {registration && (
                  <a className="mono" href={txUrl(registration.txid)} target="_blank" rel="noopener noreferrer">
                    Registration {shortHash(registration.txid, 8, 6)} ↗
                  </a>
                )}
              </li>
              <li className={stage > 2 ? "done" : phase === "certifying" ? "on" : ""}>
                <b>2 · btc.fun certifies it</b>
                <span>
                  {phase === "certifying"
                    ? "Asking every few seconds until Bitcoin has seen the payment. No confirmation needed."
                    : certificate
                      ? "Certified: the mint script will take tickets for this launch."
                      : "Automatic, seconds after the payment."}
                </span>
              </li>
              <li className={phase === "announcing" ? "on" : ""}>
                <b>3 · Announce</b>
                <span>Signed with your key and published, in the same click. Free.</span>
              </li>
            </ol>
            {!wallet.vault && <Notice tone="cyan">Registering pays from a wallet, and announcing signs with its key.</Notice>}
            {short && (
              <Notice tone="warn">
                The wallet has {group(spendable ?? 0)} sats ready; the registration needs {group(total ?? 0)}.{" "}
                {NETWORK.faucets[0] && (
                  <a href={NETWORK.faucets[0].url} target="_blank" rel="noopener noreferrer">
                    Get testnet coins ↗
                  </a>
                )}
              </Notice>
            )}
            {error && <Notice tone="warn">{error}</Notice>}
          </div>
        </div>
      </div>
      <Bar step={REGISTER} back={back}>
        {action}
      </Bar>
    </>
  );
}

/**
 * The launch as it now exists: the transactions and signatures it rests on,
 * and the way to its mint page, which waits for the opening block.
 */
function Launched({ launch }: { launch: LaunchCommitment }) {
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
                  <a className="mono" href={txUrl(launch.registration)} target="_blank" rel="noopener noreferrer" title={launch.registration}>
                    {shortHash(launch.registration, 10, 8)} ↗
                  </a>,
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
                  ? `Mining opens in ${blocks === 1 ? "1 block" : `${group(blocks)} blocks`}, about ${blocksAsTime(blocks)}. The mint page waits for it and says so.`
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

// ── what a launch earns ──────────────────────────────────────────────────────

const TICKET_PACES = [10, 50, 200, 1000] as const;

/**
 * The part creators care about most, in plain numbers: what one ticket pays
 * them, what a pace of tickets comes to, and the rules they do not choose.
 * The range is honest about the one variable: a miner's first two tickets on
 * a launch pay the promoter less, because they also pay for the miner's cell.
 */
function Earnings() {
  const [pace, setPace] = useState<number>(50);
  const low = pace * NEW_CELL.promoter;
  const high = pace * REUSE.promoter;
  return (
    <section className="cr-earn" aria-label="What your launch earns">
      <h3>What your launch earns</h3>
      <div className="cr-earn-grid">
        <div className="cr-card big">
          <div className="k">you earn per ticket</div>
          <div className="v amber">{group(REUSE.promoter)} <span className="u">sats</span></div>
          <p className="tiny faint">
            {group(NEW_CELL.promoter)} sats on a miner's first two tickets, which also pay {group(NEW_CELL.paymaster)} for
            their cell. Straight to your address, in the ticket itself.
          </p>
        </div>

        <div className="cr-card calc">
          <div className="k">if miners buy</div>
          <div className="cr-paces" role="radiogroup" aria-label="Tickets a day">
            {TICKET_PACES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={pace === n} className={pace === n ? "on" : ""} onClick={() => setPace(n)}>
                {group(n)}/day
              </button>
            ))}
          </div>
          <div className="v">{btc(low)}–{btc(high)} <span className="u">BTC/day</span></div>
          <p className="tiny faint">
            {btc(low * 7)}–{btc(high * 7)} BTC a week. Illustrative: income is only what miners choose to pay.
          </p>
        </div>
      </div>

      <dl className="cr-rules">
        <div>
          <dt>Registration</dt>
          <dd>{group(REGISTRATION_SATS)} sats, once</dd>
        </div>
        <div>
          <dt>Ticket</dt>
          <dd>{group(TICKET_SATS)} sats, fixed · {PLATFORM_PERCENT} % platform</dd>
        </div>
        <div>
          <dt>Reward</dt>
          <dd>1 token × clz² ÷ 2<sup>halvings</sup>, from {MIN_CLZ} zero bits; halving every {group(HALVING_BLOCKS)} blocks</dd>
        </div>
        <div>
          <dt>A 24-bit hash, first week</dt>
          <dd>{atoms(reward(24, 0, 0), DECIMALS, 0)} tokens</dd>
        </div>
      </dl>
    </section>
  );
}
