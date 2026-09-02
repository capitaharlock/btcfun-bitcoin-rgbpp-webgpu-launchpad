---
id: PC5
title: "Bound work verification and validated weighting"
status: backlog
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-23
---

Implement candidate hash evaluation and the adopted weight with canonical challenge/domain binding.

## Execution

- Phase: 2.
- Prerequisites: `PC1`, `PC4`, `V7`, `V8`.

## Done when

- Reject wrong network, launch, epoch, block, ticket, owner/recipient, nonce encoding and proof replay.
- Authorization and unique ticket consumption are checked independently of merely hashing a UTXO reference.
- Measure verification as part of the full supported batch budget.
