/* The create wizard's draft: what has been typed, on which step, kept for the tab.
 *
 * The last step sends a walletless visitor to the wallet page, and a wizard
 * that forgets everything they typed the moment they follow its own advice is
 * one nobody finishes. Session storage: a draft belongs to this tab's attempt,
 * not to the browser forever.
 */

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { NO_LINKS, NO_STORY, validate, type DraftFaults, type LaunchDraft } from "@/domain/launches";
import { useWallet } from "@/app/providers/WalletProvider";
import type { StepIndex } from "./steps";

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

/** Drops the saved draft: called once the launch is announced. */
export function forgetDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable: there was nothing to forget.
  }
}

export type SetDraftField = <K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) => void;

export interface CreateDraft {
  step: StepIndex;
  setStep: Dispatch<SetStateAction<StepIndex>>;
  draft: LaunchDraft;
  set: SetDraftField;
  faults: DraftFaults;
  valid: boolean;
}

export function useCreateDraft(): CreateDraft {
  const wallet = useWallet();
  const [initial] = useState(loadDraft);
  const [step, setStep] = useState<StepIndex>(initial.step);
  const [draft, setDraft] = useState<LaunchDraft>(initial.draft);
  const faults = useMemo(() => validate(draft), [draft]);
  const valid = Object.keys(faults).length === 0;

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

  const set: SetDraftField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return { step, setStep, draft, set, faults, valid };
}
