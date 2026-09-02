---
id: GR4
title: "Inactive launch closure and operator-free redemption"
status: backlog
priority: critical
owner: rjj
category: graduation
initiative: graduation-protocol
created: 2026-09-23
updated: 2026-09-23
---

Implement inactive/closed launch handling for the first demo. This task is intentionally early; it does not depend on deferred market activation.

## Execution

- Phase: 2.
- Prerequisites: `PC2`, `PC6`, `MN7`.

## Done when

- Long inactivity can be advanced with bounded work and the adopted terminal emission policy.
- Pending claims, refunds, creator escrow and final redemption have complete outcomes.
- Remaining holders can use the documented exit path without the official operator, subject to explicit chain/fee/capacity assumptions.
- No claim of nonzero residual emission or economically practical redemption forever.
