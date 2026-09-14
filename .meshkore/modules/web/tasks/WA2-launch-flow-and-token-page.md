---
id: WA2
title: "Launch page and evidence-aware state display"
status: done
priority: high
owner: rjj
category: web
initiative: web-app
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [b533adc, 5536772, bebaab6]
---

Build launch creation and the token page around immutable terms, allowed emission, reserve denomination and explicit finality states.

## Execution

- Phase: 2.
- Prerequisites: `WA1`, `TC3`, `IX2`.

## Done when

- User can inspect h0 lead time, fees, expiry policy and script identities before committing.
- Issued tokens, expired allowance and backing are not conflated; speculative guarantees are absent.

## Resolution

`apps/web/src/views/Create.tsx` asks only for identity, income address and opening; `apps/web/src/views/Launch.tsx` shows the standard terms, the opening block, the promoter, the token id, supply read from CKB cells (labelled cells, not people) and the reward by halving. Covered by `e2e/ui/create-wizard.spec.ts` and `e2e/ui/time.spec.ts`. Reserve denomination and expired allowance no longer exist under the standard tokenomics.
