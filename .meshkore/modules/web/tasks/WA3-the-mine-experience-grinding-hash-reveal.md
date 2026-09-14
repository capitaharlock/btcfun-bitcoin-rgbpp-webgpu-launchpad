---
id: WA3
title: "Mining experience and understandable settlement reveal"
status: done
priority: high
owner: rjj
category: web
initiative: web-app
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [93cfb38, bebaab6, adb2a37, c64ad7c]
---

Build the integrated mine/submit/reveal experience. A lightweight mock may be tested earlier, but acceptance requires real chain behavior.

## Execution

- Phase: 2.
- Prerequisites: `WA1`, `MN2`, `MN4`.

## Done when

- A user completes a round and understands costs, variable allocation and deadline/recovery states.
- Representative devices remain responsive and offer explicit mining controls.
- Shareable work artifacts verify actual evidence and do not imply that all participants had equal opportunity.

## Resolution

`apps/web/src/components/mining/MinePanel.tsx` and `MinerSteps.tsx` walk open, ticket, mine and mint with the reward of the best hash shown live, explicit start and stop, a backend choice, and the stage each step is waiting on; a mint is then checkable by txid on the proof page. Covered by `e2e/ui/mining.spec.ts` and `e2e/ui/time.spec.ts`. Device-aware resource handling stays in MN2.
