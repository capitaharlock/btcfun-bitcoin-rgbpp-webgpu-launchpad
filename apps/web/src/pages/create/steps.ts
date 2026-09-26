/* The create wizard's steps, and what each one is responsible for.
 *
 * One table the step nav, the bar and the draft's validation all read, so a
 * step's name, its place and the fields that must be clean before leaving it
 * cannot disagree.
 */

import { LINK_KINDS } from "@/domain/launches";
import type { DraftField } from "@/domain/launches";

export const STEPS = ["Identity", "Income", "Project", "Register", "Launched"] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;
export const REGISTER: StepIndex = 3;
export const LAUNCHED: StepIndex = 4;

/** Which draft fields each step is responsible for. */
export const OWNED: Record<StepIndex, DraftField[]> = {
  0: ["symbol", "name", "blurb", "accent"],
  1: ["promoter", "opensInBlocks"],
  2: [...LINK_KINDS.map((k) => `links.${k}` as const), "story.why", "story.plan", "image", "extras"],
  3: [],
  4: [],
};

/** What the next step is, said on the bar next to the button that goes there. */
export const NEXT: Record<StepIndex, string> = {
  0: "Next: where your income goes",
  1: "Next: picture, links and story",
  2: "Next: register and announce",
  3: "Next: your launch's summary",
  4: "Done",
};
