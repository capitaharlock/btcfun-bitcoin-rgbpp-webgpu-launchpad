---
title: Constraints
updated: 2026-09-23
status: draft
---

# Constraints

## Adopted requirements

- Testnet first; no real-fund launch before the Phase 4 independent review and
  operations gate. No code or economic invariant is considered validated yet.
- Bitcoin height defines the emission ceiling. Use discrete cumulative differences,
  integer token atoms, deterministic rounding and an explicit terminal policy.
- An expired allocation cannot be recovered, reassigned to liquidity or rolled
  into another epoch. Distinguish expired mint allowance from destruction of
  already-issued tokens.
- Mint authority, reserve debits and settlement validity must be enforced by
  scripts; the indexer and operator are never authoritative for those rules.
- Segregate redeemable reserve, pending ticket deposits, fees, creator escrow,
  liquidity contributions and occupied Cell capacity. No double counting.
- Define outstanding redemption liabilities, including unclaimed allocations,
  voluntary burns and terminal redemption, before implementing `R / S`.
- A public queue proves neither completeness nor operator availability. Specify
  authenticated admission, closure, data availability, deadlines and operator-free
  settlement or refund/exit paths, then test them with the official service off.
- Record distinct Bitcoin/CKB confirmation states. Reorg handling must cover
  protocol effects as well as indexer repair; an SPV proof is not proof of the
  latest tip by itself.
- Hash challenges bind protocol/network, launch, epoch, accepted Bitcoin block,
  ticket, owner/recipient and nonce under canonical encoding. The binding and
  admission design must prevent proof reuse and free pre-ticket grinding.
- Measure batch bytes, total cycles, locked capacity, fees and contention. A cheap
  hash alone is not evidence that a complete epoch can settle within limits.
- No administrator key may silently mint, spend reserves or change existing
  launch terms. Any upgrade/migration design must expose its trust assumptions.

## Hypotheses requiring evidence

- Backing-limited issuance may preserve the redemption ratio; it is not approved
  economics until `E1`–`E5` pass and the rule is adopted in an ADR.
- Browser PoW may create engagement. `clz²`, ticket pricing, epoch duration and
  the 1008-block half-life must be evaluated for the intended audience.
- More addresses do not demonstrate more people; a hashrate advantage being
  logarithmic does not establish farm resistance or equal opportunity.

## Prohibited claims

Do not promise capital protection, recovery of ticket cost, a guaranteed rising
floor, perpetual economically practical redemption, supply as a measure of demand,
Sybil-proof graduation, seconds-fast Bitcoin finality, or trustless settlement
merely because the operator publishes a queue.

## Process

Preserve historical ADRs with explicit supersession. Current behavior lives in
`PROTOCOL.md`; tasks link to it. Never commit MeshKore runtime/secret state.
