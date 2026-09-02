---
id: E3
title: "Design ticket admission, backing and exit rules"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: economic-validation
created: 2026-09-23
updated: 2026-09-23
---

Compare the backing-limited mint candidate with alternatives that retain the Bitcoin-height ceiling. Write a complete state transition model before adopting any formula.

## Execution

- Phase: 0.
- Prerequisites: `E1`, `E2`, `SH1`.

## Done when

- Specify genesis, R=0/S=0, pending backing, unclaimed liabilities, concurrent redemption and issued-token burns.
- Specify ticket commitment versus challenge disclosure, accepted submissions, closing deadlines, zero-work tickets, withholding, late work and refunds.
- New backing and matching liabilities enter atomically; pending deposits cannot subsidize old-holder withdrawals.
- Define reserve/fees/creator escrow/Cell capacity separately, including unsuccessful launch and terminal escrow handling.
- Every lifecycle state has a documented settlement or bounded recovery path and an explicit emission end policy.
