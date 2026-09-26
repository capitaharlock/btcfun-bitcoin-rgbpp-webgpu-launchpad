---
id: PC1
title: "Canonical schemas, Cell layout and immutable launch rules"
status: done
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [b6e6afe, 73af52d, 1299b37, 1df6a72]
---

Define canonical binary schemas and the actual Cell/script decomposition for the adopted protocol. Include launch-height commitment and versioned immutable economics.

## Execution

- Phase: 2.
- Prerequisites: `E5`, `V2`, `V5`, `V6`, `V8`, `V9`, `V10`.

## Done when

- Each field has an authoritative script and encoding; distinguish emitted/expired/burned amounts and outstanding liabilities.
- Per-launch state, intents, reserves and escrow have explicit consumption rules and no shared cross-token bottleneck.
- Concurrent issuance/redemption and pending backing follow the adopted atomicity rules.

## Resolution

The launch terms are the mint script's args — version, `h0`, metadata hash and the promoter's `scriptPubKey` — encoded once in `contracts/mint-core/src/lib.rs` and mirrored in `apps/web/src/domain/rgbpp/launch.ts`; the miner cell's idle and armed states, with the nonce in committed cell data, are in `PROTOCOL.md` §4.2 and §6.3. Each miner cell and token cell belongs to one launch and one Bitcoin UTXO, so there is no shared cross-token bottleneck. Reserves, escrow, expired allowance and liabilities were withdrawn by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)).
