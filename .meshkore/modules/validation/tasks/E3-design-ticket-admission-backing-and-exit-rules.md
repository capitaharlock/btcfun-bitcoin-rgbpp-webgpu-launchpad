---
id: E3
title: "Design ticket admission, backing and exit rules"
status: cancelled
priority: critical
owner: rjj
category: validation
initiative: economic-validation
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
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

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): ticket admission is the ticket transaction itself; there is no backing or exit rule to design. Kept as history.
