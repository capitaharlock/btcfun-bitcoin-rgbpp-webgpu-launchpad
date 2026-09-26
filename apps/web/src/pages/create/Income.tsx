/* Create, step 2: where the ticket income goes and when mining opens.
 *
 * Beside the two fields sits what that income is (`Earnings`), because the
 * address is the one thing a creator is choosing it for.
 */

import { useTip } from "@/app/hooks/useLaunches";
import { ACTIVE } from "@/domain/bitcoin";
import { blocksAsTime, group } from "@/ui/format";
import { Field } from "@/ui/primitives";
import { Earnings } from "./Earnings";
import { StepHead, type StepProps } from "./WizardChrome";

/** Where the income goes and when it starts — beside what that income is. */
export function Income({ draft, faults, set }: StepProps) {
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
