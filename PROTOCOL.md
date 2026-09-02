# btc.fun — Protocol Specification

**Status:** revised design, pre-implementation; economics and architecture unproven.**Stack:** Bitcoin, RGB++, Nervos CKB, xUDT, CKB-VM/RISC-V, Rust and TypeScript.

Community launches with verifiable mining and transparent reserves.

Execution order and acceptance gates: [roadmap](.meshkore/docs/roadmap.md).
Counterexamples and source notes: [review](.meshkore/docs/design-review.md).
Historical decisions: [evolution](.meshkore/context/idea-evolution.md).

## 1. Product and objectives

Build a community token launch lifecycle whose issuance, ownership, settlement and
redemption can be independently checked. Demonstrate deep technical competence
through executable evidence, while separately testing demand for the product.

Initial audience: existing Bitcoin/CKB communities. The first demo is one launch,
one wallet and one reserve asset, not a fundraising platform or marketplace.

Candidate loop: `COMMIT TICKET → MINE → SUBMIT → SETTLE → VERIFY → REDEEM`.
Admission and challenge timing remain Phase 0/1 decisions. A paid ticket does not
guarantee a payout above its cost. Proof-of-work here distributes application
tokens; it does not secure Bitcoin consensus.

## 2. Decision status

Adopted: Bitcoin-block scheduling; a maximum of 21,000,000 whole tokens per launch;
permanent expiry of unused epoch allowance; script-enforced issuance and reserve
rules; segregated backing; independent verification; testnet before reviewed
real-fund deployment. Token decimals are selected and frozen before implementation.

Candidate: 1008-block half-life, 3024-block headline period (approximately 21 days),
PoW-weighted epoch allocation, `clz²`, ticket fee split, backing-limited issuance,
epoch length and precise admission/close rules. Compare parameter variants in
simulation, then freeze one parameter set for the first demo; no creator-configurable
menu of economic rules in v1.

Withdrawn: capital protection; an automatically rising floor; supply as a direct
measure of demand; farm immunity; address counts as unique people; a public queue
as sufficient proof of trustless settlement; graduation automatically being a leap;
perpetual nonzero emission with finite arithmetic.

## 3. Verifiable trust

The Proof Explorer and a standalone verifier must inspect evidence independently
of btc.fun's backend: binding/authorization, accepted Bitcoin clock, issuance,
validated work, admitted-set completeness under the chosen mechanism, allocation
and reserve reconciliation. State what each proof establishes and its trust roots.

Fetching from a public endpoint is not itself proof of chain canonicality. Distinguish
local consistency, inclusion, confirmations and chain-selection assumptions. Export
portable proof bundles and support user-selected endpoints or local nodes. Invalid,
incomplete and stale evidence must be distinguishable from a valid proof.

Publish a Build Log from ADRs, including superseded decisions and unresolved
hypotheses. A reproducible but incomplete queue must not receive a fairness badge.

## 4. Economic model — to validate before contract implementation

### 4.1 Discrete issuance ceiling

Let `M = 21,000,000 × 10^decimals` token atoms, `n = max(0, h − h0)` and
candidate half-life `H = 1008`. The mathematical reference is:

```text
A(n) = floor(M × (1 − 2^(−n/H)))
B([a,b)) = A(b) − A(a)       # a,b are offsets from h0
```

The implementation must specify a deterministic approximation, error bounds,
monotonicity, rounding and terminal cutoff. `E2` selects that executable definition;
this real-valued expression is not implementation code. Budgets telescope across
contiguous epochs; minting cannot exceed the cumulative ceiling. Do not sum the
old continuous-density formula as if it were a discrete per-block budget.

Unused allowance expires permanently. Track scheduled allowance, minted tokens,
expired allowance, issued-token burns, outstanding redemption liabilities and
future allowance separately. One occupied epoch does not measure how many people
participated. State advancement/sweeping requires transactions and an incentive or
user-driven path; height alone does not execute a script.

### 4.2 Tickets and work

Tickets have a fixed price within a launch in its named reserve asset. Price and
fee parameters are selected after cost and incentive simulation. The former 85%
reserve / 10% protocol / 5% creator split is only a benchmark scenario.

Specify payment/admission before challenge disclosure or another validated defense
against mining many free candidate tickets/UTXOs and paying only for winners.
Canonical challenges bind protocol version, network, launch, epoch, accepted Bitcoin
block, ticket, authorized owner/recipient and nonce. Define replay prevention and
proof ownership; a UTXO reference is not proof of control.

A possible weight is `clz(hash)^2`. The contract evaluates the submitted candidate,
not the search history. Hardware advantage, ticket splitting, zero weights, late
entry, selective submission and withholding require adversarial analysis. The search
runs in WebGPU/WASM; no equal-hardware or farm-resistance claim is assumed.

### 4.3 Allocation and anti-dilution candidate

The original rule allocated all of `B` whenever any miner participated; this can
reduce backing per token and transfer old reserves to a cheap new entrant.

For an already initialized reserve with `R > 0`, `S > 0`, and eligible new backing
`ΔR`, investigate:

```text
m ≤ min(B, floor(ΔR × S / R))
allocation_i = floor(m × weight_i / total_weight)
```

This cap is necessary to avoid reducing `R/S` for a pure issuance transition;
it is not a complete economic design or an adopted mint formula. Define initial
issuance, exhausted reserve/liabilities, actual versus provisional `m`, rounding
remainders, zero weight, failed submissions, pending deposits and simultaneous
redemptions. Choose whether remainder atoms expire or use a deterministic
allocation rule; preserve conservation and resist ticket-splitting incentives.

New backing and new liabilities must enter the reserve atomically under the chosen
state transition. Holders must not redeem against deposits whose matching issuance
or refund remains pending. Simulate the whole lifecycle before adopting this rule.
The Bitcoin schedule remains the ceiling; it is not replaced by supply-driven decay.

### 4.4 Reserve and redemption

`R` is redeemable backing in one declared asset. Exclude pending deposits, protocol
fees, creator escrow, liquidity contributions and occupied capacity. `S` denotes
outstanding redemption liabilities, not a loosely defined circulating-supply metric.
Specify treatment of unsettled/unclaimed allocations, voluntary burns and lost keys.

For `0 < q < S`, investigate integer payout `floor(q × R / S)` in reserve atoms;
rounding leaves bounded dust and does not give exact real-number invariance. Define
`q = S`, `S = 0`, insufficient output capacity, minimum practical withdrawal and
who pays fees. Funds needed to maintain live Cells are not freely redeemable backing.

The candidate invariant is a nondecreasing redemption ratio for authorized issuance
and redemption in the reserve asset, under explicit rounding rules. This does not
promise recovery of a ticket's cost, a BTC/fiat value, or a market price floor.

Neither creator nor protocol may repurpose redemption backing, including during
market activation. Define creator escrow release, expiry and failed-launch handling
before taking payments. No money is booked twice as backing and revenue.

## 5. Lifecycle and deferred markets

First-demo lifecycle:

```text
COMMITTED → MINING → CLOSED
                 └→ DORMANT
```

For every state define ticket admission, finalization, pending claims, refunds and
redemption. `E3` chooses timeouts and terminal rules. Dormancy preserves applicable
exit rights without an operator, subject to documented chain availability, fees and
capacity constraints. Do not promise residual emission forever. A launch opens only
after its committed future `h0` and accepted-clock conditions are satisfied.

Automatic `GRADUATING → MARKET_ACTIVE` is deferred. Market liquidity must come
from separately funded contributions or an explicitly reviewed new mechanism;
reserve liabilities cannot disappear through graduation. Define the source of the
token side, pool ownership, withdrawal rights and failure recovery before integration.
Expired allowance cannot be reclaimed to seed a pool. Address thresholds are not
Sybil-resistant distribution tests; graduation is not necessarily a cross-chain leap.

## 6. Transaction architecture and trust boundaries

### 6.1 Bitcoin clock and finality

Select a Bitcoin-header/SPV validation path, chain-selection policy, confirmation
thresholds, freshness/lag bound, monotonic epoch cursor and response to delayed
relayers. CKB header references are not implicitly Bitcoin proofs. A header proof
alone does not establish that a submitted header is the latest canonical tip.

Specify same-height hash replacement, shallow/deep Bitcoin and CKB reorgs, and what
happens when CKB has already accepted a transition referring to a Bitcoin branch.
Document residual finality assumptions and recovery/pause semantics; indexer rollback
alone cannot undo accepted protocol state. No arbitrary operator-supplied height.

### 6.2 RGB++ ownership

Prove the actual Bitcoin UTXO ↔ CKB Cell authorization flow with a real wallet.
Record lock/type scripts, commitments, SPV dependencies, spend rules and who signs
every step. Separate Bitcoin-bound control from any CKB-local execution phase.

Test leap and folding only where needed. Neither replaces an authorization proof
nor automatically removes Bitcoin confirmation latency. Label provisional,
CKB-confirmed and Bitcoin-anchored states honestly.

### 6.3 Epoch admission, closure and settlement

The settler proposes transactions; scripts enforce the economic rules. Choose an
admission/closure mechanism with authenticated tickets and submissions, completeness
relative to a canonical admitted set, durable evidence and bounded deadlines.
Publication alone does not prevent omission or censorship.

Define withholding, omitted submissions, late messages, zero-work tickets, empty
epochs, total-weight calculation and competing settlers. No silent requeue into a
different challenge/epoch. Specify permissionless completion or a bounded refund/exit
when the official service fails. A public reconstruction tool is necessary but is
not a replacement for these protocol-enforced paths.

Benchmark maximum participants, bytes, inputs/outputs, proofs, total VM cycles and
capacity. A single transaction is a candidate optimization, not an unbounded design
requirement. If chunking is needed, prove atomic accounting and closure across chunks.

### 6.4 State and indexer

Use explicit per-launch state and independently admissible intents where justified.
Measure conflicts between mining, settlement and redemption. Derive indexed events
from transactions/Cell transitions; the API is a rebuildable projection. Verify
canonical state from both chains and expose provisional status until the chosen
confirmation policy permits final display.

## 7. xUDT and economic state

Before implementation, define full token Type identity, decimals, canonical binary
schemas, allowed owner-mode/extension paths, unique mint authority and mint/burn
accounting. A generic owner key must not bypass issuance caps. Decide whether and
how voluntary xUDT burns update redemption liabilities without serializing all
ordinary transfers through a global counter. Validate compatibility with RGB++.

Immutable configuration includes version/network, token identity, reserve asset,
`h0`, emission parameters, ticket economics and relevant script identities. Mutable
state includes epoch cursor/closure, issued/expired amounts, outstanding liabilities,
segregated balances and lifecycle status. Spell out which script checks each field.

## 8. Liquidity and business boundary

Evaluate existing RGB++/CKB venues early (`LQ1`) for actual asset/extension support,
liquidity funding, custody, permissions, pool creation and exits. UTXOSwap is a
candidate, not a guaranteed supported integration. Do not implement a custom AMM
before this evaluation. Later SDK adapters build unsigned actions for user review;
they do not hold funds or override reserve rules.

The initial business hypothesis is ticket-fee revenue. Measure all operating costs
and subsidy budgets. External venue volume does not automatically create protocol
revenue. Community pilots must test engagement and economic comprehension separately
from correctness; testnet behavior alone does not establish willingness to pay.

## 9. Implementation baseline

Rust `no_std` + `ckb-std`/CKB-VM for scripts; exact integer amounts, checked wide
intermediates and explicitly chosen fixed-point approximation for decay. Rust and
TypeScript agree on shared vectors and an independent high-precision reference.

Compare currently maintained RGB++ tooling, pin tested releases and deployment
hashes, and verify one complete wallet/network/SPV combination. First reserve:
one asset directly controlled by CKB scripts. Native BTC custody is deferred.

Grow a minimal monorepo toward this layout only when needed:

```text
contracts/      protocol scripts and shared primitives
packages/       math, protocol, SDK/verifier, miner, adapters as justified
apps/           minimal web, read API/indexer
services/       replaceable epoch settler
infra/ tests/   reproducible networks, evidence fixtures and CI
```

React/Vite/TypeScript for the client; PostgreSQL for rebuildable indexed state and
durable service records; Redis/Valkey only if measurements justify it. Cloudflare,
Fly.io and GitHub Actions are deployment candidates, not prerequisites for modeling.

## 10. Acceptance properties

- Authorized, bounded minting and irreversible expiry, including skipped epochs.
- Exact integer conservation of deposits, liabilities, fees, refunds and payouts.
- No unauthorized access to backing and no dilution under the eventually adopted rule.
- Correct proof binding, unique consumption, admission deadlines and allocation.
- Operator-free settlement or bounded recovery with available verification data.
- Explicit finality assumptions and tested dual-chain reorg handling.
- Bit-identical client/script results, bounded approximation error and no overflow.
- Costs and contention measured at intended load, including locked capacity.

These are requirements to prove, not a statement that the specification already
satisfies them. Phase 0 supplies counterexamples and executable economic rules;
Phase 1 supplies architecture evidence; Phase 2 supplies the integrated demo.

## 11. First successful demonstration

A reviewer can reproduce a launch from a pinned environment, use a real wallet,
inspect the Bitcoin authorization, mine/submit work, settle at least two participants,
observe an empty epoch expire, claim and redeem, and independently verify the evidence.

Then the reviewer can corrupt a proof, attempt unauthorized issuance, simulate an
omission/replay/reorg, and shut off the official operator. Invalid actions must fail;
legitimate users must complete the documented recovery path. Publish transaction
IDs, script hashes, cycle/byte/capacity measurements and known limitations.

Graduation is not required for this demonstration.

## 12. Deferred scope

Full marketplace, automatic graduation, multiple wallets/assets, native BTC reserve,
Fiber/Lightning, jackpots, fundraising/vesting, custom chain/wallet/AMM, governance
token and creator-configurable economics. Add features only after the appropriate
product and technical gates, not to increase the apparent breadth of the stack.

## 13. Open decisions and owners

| Decision | Task |
|---|---|
| Safe issuance/reserve model and accepted economic invariants | E1–E5 |
| Discrete schedule, rounding and terminal emission | E2, V5 |
| Ticket timing, challenge, weight and withholding policy | E3, SH3, V7 |
| Header/SPV clock, confirmations and reorg treatment | V8 |
| Admission completeness and operator-free recovery | V9, MN7 |
| SDK, wallet and network compatibility | V3 |
| Named reserve asset, capacity and fee payer | V6 |
| Epoch length and batch limits at intended load | V4, V10 |
| xUDT authority, extensions and liability accounting | V2, PC8 |
| Commercial segment, pilot thresholds and launch classification review | PV1–PV3, SH7 |
| Market funding, rights and venue compatibility | GR1, LQ1 |
| Script versioning, upgrades and migrations | PC8, SH1 |
