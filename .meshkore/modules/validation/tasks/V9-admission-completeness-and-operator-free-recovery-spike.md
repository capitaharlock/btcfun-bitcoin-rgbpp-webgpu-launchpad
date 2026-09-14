---
id: V9
title: "Admission completeness and operator-free recovery spike"
status: cancelled
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
---

Choose and prototype a script-enforced admission/closure mechanism that defines the canonical accepted set and supports progress or recovery without the official settler.

## Execution

- Phase: 1.
- Prerequisites: `E5`, `V2`, `V8`.

## Done when

- Show why an omitted valid participation cannot produce an accepted incorrect settlement under the chosen mechanism.
- Exercise missing data, withheld work, competing settlers and deadline expiry.
- Shut off the service; another client settles or executes a bounded protocol-defined refund/exit.
- Document data availability and any residual censorship assumptions; a published queue alone does not pass.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): there is no admitted set to complete; each mint stands alone. Kept as history.
