/* The frame every create step sits in: its heading and the bar under it.
 *
 * Shared so the bar's Back and forward action sit in the same place whatever
 * the step holds, and every step heading reads the same.
 */

import type { ReactNode } from "react";

import type { DraftFaults, LaunchDraft } from "../../lib/launches/create";
import { NEXT, STEPS, type StepIndex } from "./steps";
import type { SetDraftField } from "./useCreateDraft";

/**
 * The wizard's footer: back on the left, the one action that moves forward on
 * the right, always in the same place whatever the step holds.
 */
export function Bar({ step, back, children }: { step: StepIndex; back: (() => void) | null; children: ReactNode }) {
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
export function StepHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="cw-head">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
    </header>
  );
}

/** What a form step is given: the draft, its faults, and the one way to change a field. */
export interface StepProps {
  draft: LaunchDraft;
  faults: DraftFaults;
  set: SetDraftField;
}
