---
id: WA4
title: "Holdings, redemption value and recovery UI"
status: done
priority: high
owner: rjj
category: web
initiative: web-app
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [89d8688, dbc157c, 14f46c8, c6fabf7]
---

Show outstanding allocations, holdings and net redemption estimates in the reserve asset, with accessible recovery actions.

## Execution

- Phase: 2.
- Prerequisites: `WA2`, `MN5`, `MN7`, `IX2`.

## Done when

- Fees/capacity and provisional balances are visible; no capital-protection or guaranteed profit copy.
- Claim, refund and exit states remain understandable during operator outage.
- Core flow is usable at mobile widths even where mining capability differs.

## Resolution

`apps/web/src/views/Holdings.tsx` reads balances straight from the xUDT cells sealed to the wallet, sends and receives, explains the fee and why sealed outputs never pay it, and shows each transfer as sent, queued, settled or failed. Covered by `e2e/ui/holdings.spec.ts` and the phone-layout project. Redemption value, claims and refunds were withdrawn by the standard tokenomics.
