/* Which step the mining wizard shows, and remembering it across a reload.
 *
 * The live step is the chain's (`domain/mining/loop.ts`); the step on screen is
 * the person's, within limits. Kept as its own hook because the launch header
 * owns the view (it decides when the wizard replaces it) while the wizard
 * only renders it.
 */

import { useEffect, useRef, useState } from "react";

import type { MiningLoop } from "@/app/hooks/useMiningLoop";
import { STEPS, type LoopStep } from "@/domain/mining";

const VIEW_KEY = "btcfun:wizard-view:v1";

/** The step on screen, remembered with the live step it was chosen against. */
interface StoredView {
  view: LoopStep;
  live: LoopStep;
}

const isStep = (v: unknown): v is LoopStep => typeof v === "string" && (STEPS as readonly string[]).includes(v);

function readView(launchId: string): StoredView | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(`${VIEW_KEY}:${launchId}`) ?? "null");
    if (typeof v !== "object" || v === null) return null;
    const { view, live } = v as Record<string, unknown>;
    return isStep(view) && isStep(live) ? { view, live } : null;
  } catch {
    return null;
  }
}

function writeView(launchId: string, stored: StoredView): void {
  try {
    localStorage.setItem(`${VIEW_KEY}:${launchId}`, JSON.stringify(stored));
  } catch {
    // Storage blocked: the page still follows the loop.
  }
}

export interface WizardView {
  /** The step on screen; any step can be looked at, whichever one is live. */
  view: LoopStep;
  show: (step: LoopStep) => void;
}

/**
 * Which step the wizard shows. It follows the loop: when the live step moves
 * on, the view slides to it. In between, the person may look back at a done
 * step or ahead at the next one, and that choice survives a reload — as long
 * as the loop is still where it was when they chose it.
 */
export function useWizardView(launchId: string, ml: MiningLoop): WizardView {
  const { state, step } = ml.loop;
  // A qualifying hash makes Mint the live step, but mining goes on and its
  // counters stay the thing to watch until the person accepts a hash.
  const current: LoopStep = ml.keeping ? "mint" : state.at === "mint" ? "mine" : (step ?? "ticket");
  // Until the chain and the wallet are read the step is not known — a launch
  // looks "not open" before the tip arrives — so there is nothing to follow.
  const known = step !== null && state.at !== "reading" && state.at !== "wallet";
  const [view, setView] = useState<LoopStep>(() => readView(launchId)?.view ?? current);
  const followed = useRef<LoopStep | null>(null);
  useEffect(() => {
    if (!known) {
      if (state.at === "wallet") setView("wallet");
      return;
    }
    const was = followed.current;
    if (was === current) return;
    followed.current = current;
    if (was === null) {
      // First known step of this visit: the stored view, if the loop is still where it was.
      const stored = readView(launchId);
      setView(stored && stored.live === current ? stored.view : current);
      return;
    }
    // A ticket ready to mine stays on screen with its trace until the person
    // chooses to mine: that move is theirs (the bar's Mine).
    if (!(was === "ticket" && current === "mine")) setView(current);
  }, [known, current, launchId, state.at]);
  useEffect(() => {
    if (known) writeView(launchId, { view, live: current });
  }, [known, launchId, view, current]);
  return { view, show: setView };
}
