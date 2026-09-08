---
id: testnet-spike
title: Testnet4 functional spike
status: active
priority: high
oneliner: "A working ticket-mine-claim-transfer loop on testnet4, built to find out what settlement actually has to solve."
modules:
  - web
  - mining
  - marketplace
  - indexer
target: Phase 0/1 — research spike, ahead of the economic and architecture gates
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [interface-prototype, validate-architecture, mining-engine, unified-marketplace, web-app]
---
# Testnet4 functional spike

## Why this exists

The roadmap permits research and disposable experiments ahead of the gates.
This one takes that allowance to answer questions that a specification cannot:
what a browser can actually mine, what a real ticket payment costs and feels
like, and precisely where a token market stops being implementable without
settlement.

Everything that can be real, is. The wallet derives a standard BIP84 key from
WebAuthn PRF output and signs real testnet4 transactions. Tickets are real
payments to a provably unspendable per-launch address. Claims and transfers are
secp256k1-signed records that replay from genesis under the §4.3
backing-limited allocation candidate. The emission schedule advances with the
live chain tip, because block height is the clock.

Everything that cannot be real is labelled, not simulated quietly. There is no
consensus over which record chain is *the* chain, nothing is anchored to a
Bitcoin UTXO, the reserve is burned rather than redeemable, and market swaps are
not atomic. Each of those is stated on the screen where it matters and in the
Proof Explorer's per-claim table.

The spike's most useful output is the last one. Building the offer book made the
atomicity gap concrete: the taker pays first, the maker signs second, and no
amount of care in the client closes it. That is exactly what RGB++ single-use
seals are for, and the offer format was shaped so `V3` can add the seal without
changing anything else.

## Done when

- A visitor can connect a wallet, fund it, buy a ticket, mine, claim, and hold
  a token whose provenance replays from genesis.
- Tokens transfer between identities under signatures anyone can check.
- Browser hashrate is measured on real hardware for both CPU and GPU, feeding `V7`.
- Offers are signed, verifiable and priced, with the settlement gap named.
- No screen claims settlement, redeemability, atomicity or capital protection.

## Second pass — make it legible

The first pass built the machinery and proved it runs. Reading it back, the
product was unreadable: a table of percentages on the front page, a five-item
navigation with no order, and a palette desaturated enough to look unfinished.
None of that is cosmetic when the point is to be understood.

So the app is now four things you can do — Launches, Create, Market, Activity —
with the wallet and its holdings grouped together, because holdings *is* the
wallet's contents. The front page leads with launches you can act on, promoted
by what the feed and the books actually say rather than by an editorial list.
The emission lab became the third step of a wizard that creates a token, which
gives its charts a question a person actually has.

It also gained the one thing a single browser cannot do: let strangers see each
other. The activity index is a Cloudflare Worker over D1, chosen because it
costs nothing at rest, and deliberately kept to being an index — it verifies
with the same module the client runs and cannot forge or alter an event.

## Third pass — architecture and correctness

A full review of the running code before showing it to anyone: trust
boundaries, the payment path, the ledger's validation surface, the market's
settlement rule, mining lifecycle and the wording of every claim the code
makes. Nine defects were found and fixed, each with a regression test; the rest
of the pass was about language. `SH8` records it.

The three that mattered most were quiet ones. The fee estimator counted outputs
instead of measuring them, so every ticket and every offer fill — all of which
carry an OP_RETURN — underpaid by about 40%. An offer showed `settled` on the
strength of a memo, so one atom could close a five-token sale with no payment on
record. And the emission schedule rounded the opposite way from the formula its
own comment declared, which no property test could catch because monotonicity
and telescoping hold under either direction.

It also forced a question the spike had been answering only implicitly: which
of this is implemented, and which is the architecture being described?
[capabilities.md](../../docs/capabilities.md) is now the canonical answer, and
it is blunt about the summary — every cryptographic step is genuine and
checkable, and what is missing is the part that makes any of it binding on
anyone else.

## Task plan

- `#MN8` WebGPU kernel and the mining backend port
- `#LB4` passkey wallet and chain access on testnet4
- `#LB5` signed, replayable token ledger
- `#LB6` ticket purchase, claim flow and chain verification UI
- `#MK4` signed offer book and the atomicity boundary
- `#DS3` vivid palette and product surfaces
- `#LB7` four-section navigation and the front page
- `#LB8` create-your-token wizard
- `#IX5` public activity index on Cloudflare D1
- `#SH8` architecture review and correctness hardening
- `#LB9` end-to-end runner against live testnet4
