/* Create, step 3 (optional): the picture, the project's links and its story.
 *
 * All of it is part of the signed announcement but not of the token: none of
 * it changes the token's id, and nothing on chain enforces it.
 */

import type { ReactNode } from "react";

import { imageFor } from "@/domain/launches";
import { LINK_KINDS, MAX_STORY_LENGTH, type LinkKind, type StoryPart } from "@/domain/launches";
import { LINK_LABEL, PixelIcon } from "@/ui/PixelIcon";
import { Field, Notice } from "@/ui/primitives";
import { TokenImage } from "@/ui/TokenImage";
import { StepHead, type StepProps } from "./WizardChrome";

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

export function Project({ draft, faults, set }: StepProps) {
  const setLink = (kind: LinkKind, value: string) => set("links", { ...draft.links, [kind]: value });
  const setStory = (part: StoryPart, value: string) => set("story", { ...draft.story, [part]: value });
  const picture = imageFor(draft.image);
  const row = (kind: LinkKind | "image", label: string, fault: string | undefined, icon: ReactNode, input: ReactNode) => (
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
