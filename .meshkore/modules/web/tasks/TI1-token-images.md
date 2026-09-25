---
id: TI1
title: "Token images, halving bars that mean something, simulated examples and the featured DEMO launch"
status: done
priority: high
owner: rjj
category: web
initiative: web-app
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T19:30:00Z
---

Operator feedback on the catalogue: the segmented bars must mean something, cards must say where a
launch is in its halving schedule, every token needs a large picture on every surface, and the
catalogue should show launches in other states (clearly simulated) plus a DEMO launch newcomers
know to click.

## Done when

- The card bar is progress through the current halving period, labelled
  `Halving k · n/1,008 blocks · rate ÷2^k`, with a ladder of halvings 0–3 and one sentence on what
  happens next; nothing is placed against the placeholder tip before the chain answers.
- Simulated examples are a distinct type (`source: "simulated"`) that nothing that mints, lists or
  buys accepts; badged SIMULATED, MINE and explorer links off, numbers the standard's reward.
- A launch is featured by id, or as the DEMO launch when the platform identity announced it first.
- Real launches link to mempool (promoter / ticket payments) and the CKB explorer (token, mint script).
- Announcements carry an optional signed `image`; `imageHash` in the terms can be checked against the
  bytes; the official launches have platform artwork until the seed script re-announces them.

## Resolution

- `lib/launches/progress.ts` (position, labels, ladder), `components/launch/HalvingBar.tsx`.
- `data/showcase.ts`: six examples (halving 0, 2, 3, 9, spent, opening) whose supply is the sum of
  their mint tallies at `reward()`; `showcase.test.ts` checks it and, with `@ts-expect-error`, that
  an example cannot reach the miner or the market.
- `lib/launches/featured.ts`: `FEATURED_LAUNCH_IDS` (empty) and DEMO-by-`PLATFORM_IDENTITY`
  (`VITE_PLATFORM_IDENTITY`, the seed wallet by default; the browser suite builds with its own key).
- `lib/launches/image.ts`: `imageFor`, `imageMatches`, `PLATFORM_IMAGES`, `artFor`; `image` is signed
  in `commitmentId` only when present, so older announcements keep their digest. The wizard's step 3
  takes an image; it does not hash it into the terms.
- `ui/TokenImage.tsx` on the catalogue (hero), token page (xl, with "verified" / "≠ terms" pips),
  market ticker and listings, activity rows; falls back to the pixel sigil. Wallet views are left to
  their owners to wire.
- 18 original pixel-art SVGs in `apps/web/public/tokens/`, drawn by `apps/web/scripts/tokens/art.mjs`.
- `scripts/rgbpp/seed.mjs refresh` re-announces the official launches with their image (not run).
