---
title: Architecture
updated: 2026-09-23
status: draft
---

# Architecture — target to validate

```text
Browser + one supported wallet
  ├─ ticket admission / mining / claim / redemption
  ├─ independent verifier (portable evidence, declared trust roots)
  └─ read API / indexer (rebuildable projections)
                    │
Bitcoin headers / SPV / accepted clock policy
                    │
RGB++ binding and authorization ── CKB Cells / CKB-VM
                                    ├─ launch config + mint authority
                                    ├─ ticket intents / epoch closure
                                    ├─ emission / allocation liabilities
                                    └─ segregated reserve / redemption
                    │
Permissionless settlement or bounded refund/exit
Official settler is one implementation, not the only recovery route
```

Bitcoin schedules issuance and supplies explicitly accepted challenge blocks.
CKB validates economic transitions. Specify for each transition whether authority
comes from spending a Bitcoin-bound UTXO, a CKB lock, or another proved mechanism.
Using a UTXO in a hash does not itself prove authority over that UTXO.

The standard RGB++ transfer path, leap and transaction folding are separate
capabilities to test. Folding is not an assumed universal acceleration layer;
graduation is not inherently a leap. Report provisional, CKB-confirmed and
Bitcoin-anchored status separately, with confirmation thresholds and residual risk.

Cells hold immutable configuration, uniquely controlled issuance state, ticket
intents, epoch data and reserve liabilities. Avoid a global cross-token Cell, and
measure per-token contention between tickets, settlement and redemption too.
Do not promise an unbounded epoch in one transaction: benchmark the supported
batch size and define overflow/closure behavior before choosing a chunked design.

xUDT composition requires a concrete authority/extension design. Define the full
token Type identity, permitted owner-mode paths and voluntary-burn behavior; an
off-chain circulating-supply counter is not sufficient for redemption accounting.

**First demo:** one CKB-side reserve asset; wallets and SDK selected by a measured
compatibility matrix. Native BTC custody is deferred research, not a transparent
swap of an interface. No automatic graduation or reserve migration to a DEX.

**Repository:** grow from a Rust protocol/math workspace and minimal TypeScript
SDK/verifier. Add web, indexer and settler when the corresponding vertical slice
needs them. The target layout is documented in `PROTOCOL.md` §9; do not scaffold
empty packages to demonstrate breadth.
