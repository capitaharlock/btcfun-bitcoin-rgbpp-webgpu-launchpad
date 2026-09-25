---
id: TC1
title: "Permissionless launch and future-height commitment"
status: done
priority: high
owner: rjj
category: token-creation
initiative: token-launch
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [1df6a72, 5536772, b6e6afe]
---

Build the launch transaction using the adopted immutable configuration and accepted Bitcoin-clock policy.

## Execution

- Phase: 2.
- Prerequisites: `PC1`, `PC2`, `PC6`, `PC8`.

## Done when

- One real wallet creates a valid launch with token identity, named reserve asset and committed future h0.
- Minimum announcement lead time is enforced if required by the adopted model; no pre-h0 issuance is possible.
- Opening is derived from valid clock/state conditions; any required advancement transaction has a callable path.

## Resolution

A launch is its terms: the token's type hash is derived from the mint script's args, which commit to `h0`, the promoter and the metadata (`apps/web/src/lib/rgbpp/launch.ts`), and anyone can create one without permission (`apps/web/src/views/create/`, `apps/web/src/lib/launches/create.ts`). Issuance before `h0` is refused on chain (`nothing_is_minted_for_a_ticket_anchored_before_the_launch_opens`, `contracts/tests/src/mint/`). No reserve asset is named: the standard has none ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)).
