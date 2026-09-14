---
id: PC3
title: "Admission, closure and weighted allocation validation"
status: cancelled
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
---

Enforce the adopted eligible mint and weighted allocation against the canonical admitted set. Integrate V9’s completeness, closure and timeout rules.

## Execution

- Phase: 2.
- Prerequisites: `PC1`, `PC4`, `PC5`, `PC6`, `PC8`.

## Done when

- Reject omission, duplicate use, invalid work, incorrect denominator, oversized mint and unauthorized recipients.
- Remainders and zero weights follow specified conservation rules.
- Late submissions cannot silently migrate across epochs; pending deposits and matching liabilities settle atomically.
- Document and test timing/withholding assumptions instead of claiming no ordering advantage categorically.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): there is no admission queue or weighted allocation; a mint is one miner's result, checked by the mint script. Kept as history.
