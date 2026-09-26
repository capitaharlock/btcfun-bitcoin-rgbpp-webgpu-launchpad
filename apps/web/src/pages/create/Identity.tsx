/* Create, step 1: what the token is called and what it looks like.
 *
 * The preview sprite is drawn from the draft's name, not its id: the id
 * includes the registration and the certificate, so the final sprite exists
 * only once the launch is registered, and the step says so.
 */

import type { CSSProperties } from "react";

import { ACCENTS, type LaunchDraft } from "@/domain/launches";
import { slugFor } from "@/domain/launches";
import { Field, More, Panel } from "@/ui/primitives";
import { Sigil } from "@/ui/Sigil";
import { StepHead, type StepProps } from "./WizardChrome";

const ACCENT_LABELS: Record<(typeof ACCENTS)[number], string> = {
  "var(--amber)": "Amber",
  "var(--cyan)": "Cyan",
  "var(--magenta)": "Magenta",
  "var(--violet)": "Violet",
  "var(--mint)": "Mint",
  "var(--warn)": "Gold",
};

/**
 * What the draft's sprite is drawn from until it is registered. The final
 * sprite comes from the token id, which includes the registration and the
 * certificate, so it exists only once the launch is registered.
 */
function previewSeed(draft: LaunchDraft): string {
  return `draft:${draft.symbol}:${draft.name}`;
}

export function Identity({ draft, faults, set }: StepProps) {
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
                  style={{ "--swatch": accent } as CSSProperties}
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
