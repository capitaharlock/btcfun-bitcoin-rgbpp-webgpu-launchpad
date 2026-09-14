---
id: PC2
title: "Discrete emission ceiling and permanent allowance expiry"
status: cancelled
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
---

Implement PROTOCOL.md §4.1 using the accepted Bitcoin clock and E2’s discrete arithmetic.

## Execution

- Phase: 2.
- Prerequisites: `PC1`, `PC4`.

## Done when

- Minting never exceeds the cumulative ceiling under the adopted approximation and terminal policy.
- Empty, skipped and partially filled epochs expire their unused allowance permanently.
- Lazy advancement can account for long inactivity without unbounded per-epoch work; keeper/user initiation is specified.
- Expired allowance and issued-token burn have distinct reproducible counters.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): there is no epoch budget or cumulative ceiling; each ticket mints the standard reward, which reaches zero after at most 43 halvings. Kept as history.
