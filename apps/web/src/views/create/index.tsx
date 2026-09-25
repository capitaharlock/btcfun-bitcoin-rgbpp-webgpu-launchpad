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
 * the bottom of the card. Each step is its own file in this folder; this one
 * holds the step nav and decides which step is reachable.
 */

import { useEffect, useMemo, useState } from "react";

import { ACTIVE } from "../../lib/bitcoin/network";
import { group } from "../../lib/format";
import { REGISTRATION_SATS } from "../../lib/launches/certificate";
import { pendingRegistration, type LaunchCommitment, type Registration } from "../../lib/launches/create";
import { Chip, PageHead } from "../../ui/primitives";
import "./create.css";
import { Identity } from "./Identity";
import { Income } from "./Income";
import { Launched } from "./Launched";
import { Project } from "./Project";
import { Register } from "./Register";
import { LAUNCHED, OWNED, REGISTER, STEPS, type StepIndex } from "./steps";
import { useCreateDraft } from "./useCreateDraft";
import { Bar } from "./WizardChrome";

export function Create() {
  const { step, setStep, draft, set, faults, valid } = useCreateDraft();
  // A registration already paid for exactly this draft — in this visit or an
  // earlier one. Once it exists the terms are fixed: going back to edit them
  // would make a different launch, one the payment does not cover. Only a
  // valid draft has terms to look one up by.
  const stored = useMemo(() => (valid ? pendingRegistration(draft) : null), [draft, valid]);
  const [paid, setPaid] = useState<Registration | null>(null);
  const registration = paid ?? stored;
  const [launched, setLaunched] = useState<LaunchCommitment | null>(null);

  // Every step starts at the top of the form, wherever the last one was left.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

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
