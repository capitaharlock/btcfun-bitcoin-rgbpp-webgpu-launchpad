---
id: PC5
title: "Bound work verification and validated weighting"
status: done
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [b6e6afe, 1299b37]
---

Implement candidate hash evaluation and the adopted weight with canonical challenge/domain binding.

## Execution

- Phase: 2.
- Prerequisites: `PC1`, `PC4`, `V7`, `V8`.

## Done when

- Reject wrong network, launch, epoch, block, ticket, owner/recipient, nonce encoding and proof replay.
- Authorization and unique ticket consumption are checked independently of merely hashing a UTXO reference.
- Measure verification as part of the full supported batch budget.

## Resolution

Work verification is enforced on chain by the mint script (`contracts/mint`): the challenge is the hash of the ticket's Bitcoin output, the hash of challenge and nonce must reach 16 leading zero bits, and the reward is `clz²`-weighted by the standard. Tested in `contracts/tests` (OC2).
