---
title: Constraints
updated: 2026-09-24
status: draft
---

# Constraints

## First premise — engineering quality

This repository is read as evidence of engineering judgement before it is read
as a product. Code quality is therefore the highest-priority constraint and
outranks scope: ship less, never worse.

Binding rules. One concept has one implementation — extract a module rather than
copy a block. Depend on interfaces, not concrete backends, wherever a second
backend is foreseeable. Keep every language's own idioms and the framework's own
structure; no bespoke substitute for a facility the framework provides. Types
describe real states, never `any`. Anything non-obvious carries a comment saying
*why*, not what. Every rule that can be tested is tested. An unverified claim is
stated as unverified.

## Adopted requirements

- Testnet first; no real-fund launch before the Phase 4 independent review and
  operations gate.
- Every launch follows the standard tokenomics (`PROTOCOL.md` §4). A creator
  chooses identity, the promoter address and the opening height, never an
  economic parameter.
- Integer token atoms and exact integer arithmetic; the Rust and TypeScript
  reward functions pass the same vectors, and the reward reaches exactly zero at
  the terminal halving.
- A signed mint must never become invalid. Every condition a mint is checked
  against is fixed before it is signed: the rate comes from the ticket's anchor,
  and a mint may not re-arm.
- Mint authority and the promoter payment are enforced by the mint script; the
  client, the index and the operator are never authoritative for those rules.
- The challenge is the ticket's own Bitcoin output, so work cannot be
  precomputed or reused, and each ticket mints at most once.
- The RGB++ queue service may complete transactions but never decides them;
  anyone with an SPV proof can complete the same transaction without it.
- Record distinct Bitcoin/CKB confirmation states. Reorg handling must cover
  protocol effects as well as indexer repair; an SPV proof is not proof of the
  latest tip by itself.
- A sale delivers tokens and payment in one Bitcoin transaction or not at all.
- Measure bytes, cycles, locked capacity and fees on testnet, and publish them.
- No administrator key may silently mint or change existing launch terms. The
  mint script's code cell is unspendable and referenced by data hash.

## Hypotheses requiring evidence

- Browser PoW may create engagement. Whether a fixed ticket price with a weekly
  halving suits the intended audience is for pilots to show.
- More addresses do not demonstrate more people; a hashrate advantage being
  logarithmic does not establish farm resistance or equal opportunity.

## Prohibited claims

Do not promise capital protection, recovery of ticket cost, a floor, a reserve,
redemption, a price, supply as a measure of demand, Sybil-proof graduation,
seconds-fast Bitcoin finality, or trustless settlement merely because the
operator publishes a queue.

## Process

Preserve historical ADRs with explicit supersession. Current behavior lives in
`PROTOCOL.md`; tasks link to it. Never commit MeshKore runtime/secret state.
