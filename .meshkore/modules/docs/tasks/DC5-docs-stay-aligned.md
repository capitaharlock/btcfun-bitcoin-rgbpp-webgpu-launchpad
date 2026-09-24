---
id: DC5
title: "Documentation stays aligned with the code"
status: done
priority: high
owner: rjj
category: docs
initiative: public-docs
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T15:10:00Z
---

Each docs page declares the source files it describes. A check compares the
last commit touching each source with the last commit touching its page and
fails when a source is newer; it runs before every deploy. The project guide
states the rule: a change to a documented behaviour updates its page in the
same change.

## Done when

- `npm run docs:check` exists, runs in the deploy script, and fails on a stale page.

## Resolution

`apps/web/src/docs/sources.json` declares each page's sources and also drives the docs navigation. `apps/web/scripts/docs/check.mjs` (logic in `scripts/docs/stale.mjs`, tested by `stale.test.mjs`) fails when a source was committed after its page, has uncommitted changes the page lacks, or no longer exists. `npm run docs:check` exists and `npm run deploy` runs it first. The rule is stated in the root `README.md`.
