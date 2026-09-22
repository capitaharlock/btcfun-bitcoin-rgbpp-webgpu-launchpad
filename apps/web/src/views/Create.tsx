/* Create your token.
 *
 * Four steps, all about identity: what it is called and looks like, where its
 * ticket income goes and when it opens, where the project lives and why it
 * raises funds, and the signature. There is no economics step — every token
 * follows the same standard (`PROTOCOL.md` §4), so a creator cannot make a
 * token look scarce by picking a small number, and tokens stay comparable.
 *
 * The last step registers the launch: one Bitcoin payment of
 * `REGISTRATION_SATS` to the platform, which btc.fun's signer checks before it
 * certifies the terms — the mint script takes tickets only for certified terms
 * (`lib/launches/certificate.ts`). Then a free signature announces it. The
 * payment is kept on the device the moment it is sent, so nothing here ever
 * pays twice. A launch opens at a future height so that its creator cannot
 * mine it before anyone else has heard of it. Links, story and picture are
 * part of the signed announcement but not of the token: they never change its
 * id, and nothing on chain enforces them.
 *
 * Under the steps, always in view, is what a launch earns: the ticket share,
 * the fee, and what a given number of tickets a day comes to.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../App";
import { useTip } from "../hooks/useLaunches";
import {
  ACCENTS,
  createLaunch,
  payRegistration,
  pendingRegistration,
  requestCertificate,
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

const STEPS = ["Identity", "Income", "Project", "Register"] as const;
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
        lede={`One registration of ${group(REGISTRATION_SATS)} sats, then every ticket pays you. Same rules as every launch.`}
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
          {step === LAST && <Register draft={draft} />}

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

      <Earnings opensAt={draft.opensInBlocks} />
    </div>
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
              The sprite is drawn from the token's id, which your name, sentence, income address, opening block and
              registration fix; this one is a preview, and the final one appears when the launch is registered. URL: <span className="mono">/launch/{slugFor(draft.symbol) || "symbol"}-…</span>, the
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
    <Panel eyebrow="step 2" title="Where your income goes, and when it opens">
      <div className="grid g2">
        <Field label="Ticket income to" hint={faults.promoter ?? `Every ticket pays this address ${group(REUSE.promoter)} sats. Permanent.`}>
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
      </div>
      <p className="tiny faint clamp">
        A launch opens at a future block, so nobody — you included — can mine it before it is announced. What it earns is
        below.
      </p>
    </Panel>
  );
}

function Project({ draft, faults, set }: StepProps) {
  const setLink = (kind: LinkKind, value: string) => set("links", { ...draft.links, [kind]: value });
  const setStory = (part: StoryPart, value: string) => set("story", { ...draft.story, [part]: value });
  const picture = imageFor(draft.image);
  return (
    <Panel eyebrow="step 3 · optional" title="Picture, links and story">
      <div className="cr-sections">
        <section className="cr-section">
          <h3>Picture</h3>
          <div className="cr-picture">
            <TokenImage art={picture ? { src: picture, by: "creator" } : null} seed={draft.symbol || "draft"} accent={draft.accent} symbol={draft.symbol || "Your"} size="lg" />
            <Field label="Image address" hint={faults.image ?? "Square, an https:// address or one of this site's under /tokens/."}>
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
        </section>

        <section className="cr-section">
          <h3>Links</h3>
          <div className="cr-links">
            {LINK_KINDS.map((kind) => (
              <label key={kind} className={`cr-link${faults[`links.${kind}`] ? " bad" : ""}`}>
                <span className="cr-link-icon" aria-hidden="true">
                  <PixelIcon kind={kind} />
                </span>
                <span className="cr-link-name">
                  {LINK_LABEL[kind]}
                  {faults[`links.${kind}`] && <span className="cr-link-fault"> · {faults[`links.${kind}`]}</span>}
                </span>
                <input
                  className="input"
                  inputMode="url"
                  spellCheck={false}
                  placeholder={LINK_PLACEHOLDER[kind]}
                  value={draft.links[kind]}
                  onChange={(e) => setLink(kind, e.target.value)}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="cr-section">
          <h3>Story</h3>
          <div className="grid g2">
            {(["why", "plan"] as const).map((part) => (
              <Field
                key={part}
                label={STORY_LABEL[part].label}
                hint={faults[`story.${part}`] ?? `${draft.story[part].length}/${MAX_STORY_LENGTH}`}
              >
                <textarea
                  className="input"
                  rows={4}
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
        <p className="tiny faint clamp">Signed by you with the announcement and shown on the launch page. Not enforced on chain.</p>
      </div>
    </Panel>
  );
}

/** The registration's network fee: one plain input, the platform, the commitment, change. */
function registrationFee(feeRate: number): number {
  return Math.ceil(estimateVsize(1, [P2WPKH_SCRIPT_BYTES, opReturnScriptBytes(32), P2WPKH_SCRIPT_BYTES]) * feeRate);
}

type Certificate = { state: "none" } | { state: "asking" } | { state: "failed"; error: string } | { state: "ready"; certificate: string };

function Register({ draft }: { draft: LaunchDraft }) {
  const wallet = useWallet();
  const tokens = useTokens();
  const registry = useLaunchRegistry();
  const tip = useTip();
  const [registration, setRegistration] = useState<Registration | null>(() => pendingRegistration(draft));
  const [cert, setCert] = useState<Certificate>({ state: "none" });
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; h0: number } | null>(null);
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
  const short = total !== null && spendable !== null && spendable < total;
  const h0 = registration?.h0 ?? (tip ? tip + draft.opensInBlocks : null);

  const ask = useCallback(
    async (paid: Registration) => {
      setCert({ state: "asking" });
      try {
        setCert({ state: "ready", certificate: await requestCertificate(draft, paid) });
      } catch (err) {
        setCert({ state: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    },
    [draft],
  );

  // A registration paid earlier — in this visit or before a reload — is
  // certified without paying again.
  useEffect(() => {
    if (registration && cert.state === "none") void ask(registration);
  }, [registration, cert.state, ask]);

  const pay = async () => {
    if (!wallet.vault || !tip || feeRate === null) return;
    setBusy(true);
    setError(null);
    try {
      const free = await tokens.service.freeUtxos(wallet.vault.address);
      const utxos = plainFunding(free, landingTxids(tokens.operations));
      const paid = await payRegistration(wallet.vault, draft, tip + draft.opensInBlocks, utxos, feeRate, (hex) => tokens.service.broadcast(hex));
      setRegistration(paid);
      void wallet.refresh();
    } catch (err) {
      setError(err instanceof InsufficientFunds ? "Not enough bitcoin for the registration and its network fee." : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const announce = async () => {
    if (!wallet.vault || !registration || cert.state !== "ready") return;
    setBusy(true);
    setError(null);
    try {
      const commitment = await createLaunch(wallet.vault, draft, registration, cert.certificate);
      registry.refresh();
      forgetDraft();
      setCreated({ id: commitment.id, h0: commitment.h0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Panel eyebrow="done" title={`${draft.symbol} is registered and announced`}>
        <div className="row">
          <Sigil seed={created.id} accent={draft.accent} size="lg" />
          <p className="clamp">
            Certified by btc.fun. Opens at block <span className="mono">{group(created.h0)}</span>; from then on every
            ticket pays your address.
          </p>
        </div>
        <div className="rule" />
        <div className="row wrapped">
          <button className="btn primary" onClick={() => navigate(`/launch/${created.id}`)}>Open {draft.symbol}</button>
          <button className="btn ghost" onClick={() => navigate("/")}>Back to launches</button>
        </div>
      </Panel>
    );
  }

  const stage = !registration ? 1 : cert.state === "ready" ? 3 : 2;
  return (
    <Panel eyebrow="step 4" title="Register it, then announce it">
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
        </div>

        <div className="cr-register">
          <ol className="cr-stages">
            <li className={stage > 1 ? "done" : "on"}>
              <b>1 · Pay the registration</b>
              <span data-paying-from={wallet.vault?.address}>
                {group(REGISTRATION_SATS)} sats to btc.fun, once{fee !== null ? ` + ${group(fee)} sats network fee` : ""}
                {wallet.vault ? `, from ${shortHash(wallet.vault.address, 8, 6)}` : ""}.
              </span>
              {registration && (
                <a className="mono" href={txUrl(registration.txid)} target="_blank" rel="noopener noreferrer">
                  {shortHash(registration.txid, 8, 6)} ↗
                </a>
              )}
            </li>
            <li className={stage > 2 ? "done" : stage === 2 ? "on" : ""}>
              <b>2 · btc.fun certifies it</b>
              <span>
                {cert.state === "asking"
                  ? "Checking your payment…"
                  : cert.state === "failed"
                    ? cert.error
                    : cert.state === "ready"
                      ? "Certified: the mint script will take tickets for this launch."
                      : "Automatic, seconds after the payment."}
              </span>
            </li>
            <li className={stage === 3 ? "on" : ""}>
              <b>3 · Announce</b>
              <span>A free signature with your key publishes it.</span>
            </li>
          </ol>

          {!wallet.vault ? (
            <>
              <Notice tone="cyan">Registering pays from a wallet, and announcing signs with its key.</Notice>
              <a className="btn primary block" href="#/wallet">Connect a wallet</a>
            </>
          ) : stage === 1 ? (
            <>
              <button className="btn primary block lg" disabled={busy || total === null || short} onClick={() => void pay()}>
                {busy ? "Signing…" : total === null ? "Pricing…" : `Pay registration · ${group(total)} sats`}
              </button>
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
            </>
          ) : stage === 2 ? (
            cert.state === "failed" ? (
              <button className="btn block lg" onClick={() => registration && void ask(registration)}>
                Ask for the certificate again
              </button>
            ) : (
              <button className="btn block lg working" disabled aria-busy="true">
                Certifying…
              </button>
            )
          ) : (
            <button className="btn primary block lg" disabled={busy} onClick={() => void announce()}>
              {busy ? "Signing…" : `Announce ${draft.symbol} · free`}
            </button>
          )}
          {error && <Notice tone="warn">{error}</Notice>}
          <More summary="What registering guarantees">
            <p>
              The payment commits to this launch's terms, so it pays for this launch only. btc.fun checks it and signs the
              terms; the mint script on CKB refuses tickets for any terms it has not signed, so {draft.symbol || "your token"}{" "}
              exists only as launched here, and anyone can check the certificate and the payment it names. The
              registration is kept on this device the moment it is sent: a reload continues it and never pays twice.
            </p>
            <p>Not refundable. Once announced, nothing above can change: a different field would be a different token.</p>
          </More>
        </div>
      </div>
    </Panel>
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
function Earnings({ opensAt }: { opensAt: number }) {
  const tip = useTip();
  const [pace, setPace] = useState<number>(50);
  const low = pace * NEW_CELL.promoter;
  const high = pace * REUSE.promoter;
  return (
    <section className="cr-earn" aria-label="What your launch earns">
      <div className="cr-earn-head">
        <div className="eyebrow">the standard</div>
        <h2>What your launch earns</h2>
        <p className="faint clamp">
          Every launch follows the same rules. You choose the name and the address — never the price, the supply or the
          reward — so every token is comparable, and yours earns exactly what its miners pay.
        </p>
      </div>

      <div className="cr-earn-grid">
        <div className="cr-card big">
          <div className="k">you earn per ticket</div>
          <div className="v amber">{group(REUSE.promoter)} <span className="u">sats</span></div>
          <p className="tiny faint">
            {group(NEW_CELL.promoter)} sats on a miner's first two tickets here, which also pay {group(NEW_CELL.paymaster)} for
            the miner's cell. Paid straight to your address, in the ticket's own transaction.
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
          <div className="v">{btc(low)}–{btc(high)} <span className="u">BTC a day</span></div>
          <p className="tiny faint">
            {btc(low * 7)}–{btc(high * 7)} BTC a week. Illustrative: income is only what miners choose to pay.
          </p>
        </div>

        <div className="cr-card">
          <div className="k">registration</div>
          <div className="v">{group(REGISTRATION_SATS)} <span className="u">sats, once</span></div>
          <p className="tiny faint">Pays btc.fun to list and certify the launch. Tickets then pay the platform {PLATFORM_PERCENT} %.</p>
        </div>
      </div>

      <dl className="cr-rules">
        <div>
          <dt>Ticket</dt>
          <dd>{group(TICKET_SATS)} sats, fixed</dd>
        </div>
        <div>
          <dt>Reward</dt>
          <dd>1 token × clz² ÷ 2<sup>halvings</sup>, from {MIN_CLZ} zero bits</dd>
        </div>
        <div>
          <dt>A 24-bit hash, first week</dt>
          <dd>{atoms(reward(24, 0, 0), DECIMALS, 0)} tokens</dd>
        </div>
        <div>
          <dt>Halving</dt>
          <dd>every {group(HALVING_BLOCKS)} blocks, about a week</dd>
        </div>
        <div>
          <dt>Opens at</dt>
          <dd>{tip ? `block ${group(tip + opensAt)}` : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}
