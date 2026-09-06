---
title: Idea evolution
updated: 2026-09-23
status: draft
---

# Idea evolution — history, including rejected guarantees

The only place in `context/` that keeps history. Current requirements are in PROTOCOL.md; historical claims here may have been
superseded by later review. **Read this before proposing a direction**: several
obvious-looking ideas below were already tried and rejected.

## 1. pump.fun on Bitcoin (discarded)

The original spec ported the pump.fun lifecycle to RGB++/CKB: a bonding
curve as primary issuance *and* price discovery, graduating into liquidity.
It never asked whether that loop transfers to a slow, expensive chain.

## 2. "Provably Bitcoin" (kept — still the positioning)

"Bitcoin-native" is unverifiable marketing aimed at the most skeptical
audience in crypto. RGB++'s isomorphic binding is the one property
account-chain competitors cannot replicate, so it became a feature you can
check rather than a claim: Proof Explorer + Build Log. Same pass produced
the verifiable-settlement principle. (ADR `positioning-provable-bitcoin-trust`.)

## 3. The trading loop doesn't transfer (the turning point)

pump.fun works because Solana is fast and cheap. On Bitcoin a transaction
must be *worth* its cost and its wait, so copying real-time trading copies
the one thing the chain cannot support. Operator's alternative: issue by
**mining**, following BRO (`bitcoinos/charms-bro`): challenge = a UTXO you
own, nonce in an `OP_RETURN`, reward `1e8·clz²/2^quincenas`.

## 4. Mining model, first pass

Kept: "your UTXO is your challenge" is the *same* single-use-seal primitive
RGB++ already uses, so the mechanic is native rather than bolted on; `clz`
rewards are variable-ratio reinforcement; one tx per mint suits a slow
chain; fair launch is the only issuance story this culture respects.

Rejected in that pass: calendar halvings, fees to the creator, mining with
no exit path. A first fix — decay by *minted supply* — was proposed and
then discarded in §5.

## 5. Supply-decay reversed (discarded, do not re-propose)

Decay driven by minted supply froze dead launches at full reward. Worse, it
inverted the incentive: emission was richest where demand was lowest, so it
priced neglect instead of attention, and removed the clock that makes a
mint a coordination game.

## 6. Mining, pari-mutuel and reserve model (superseded on review)

The first mining specification combined Bitcoin-height decay (1008-block baseline),
21M maximum supply, empty-epoch expiry, all-budget pari-mutuel allocation, a ticket-
funded reserve and address/reserve thresholds for graduation. It asserted that
supply measured demand, reserve backing rose automatically and hardware farms
could not dominate.

Those assertions were hypotheses presented too strongly. They are preserved in the
superseded ADRs; they are not constraints on future implementation. In particular,
falling turnout can increase tokens per ticket and dilute existing backing, while
one recurring participant can keep consuming epoch budgets without a community.
A logarithmic best-hash advantage does not prove farm immunity when combined with
ticket and timing strategies. Address counts do not identify independent people.

## 7. Evidence-led correction (current direction)

The September 23 review retains Bitcoin-scheduled issuance, RGB++/CKB, browser
mining and the Proof Explorer, but requires economic validation before contracts.
Use a discrete cumulative emission ceiling and explicit integer accounting. Study
backing-limited issuance as a candidate, with genesis, refunds, pending deposits,
liabilities and terminal states defined before adoption.

The first demo proves one complete lifecycle with one wallet and one CKB-side
reserve asset. Independent verification, negative cases, two-chain finality and
operator-free recovery are part of that demo. Automatic graduation, multiple
wallets, a native BTC reserve and a marketplace are deferred. Backing owed to holders
cannot finance market liquidity. Inactive-launch exits remain first-demo scope.

The initial audience is community-token users, not general project fundraising.
Pilot evidence determines whether to commercialize, narrow the product or keep a
technically strong demonstration. Testnet-first and independent review remain.

## 8. What building it on testnet4 taught (spike)

Three findings worth keeping, from making the loop actually run.

Browser mining is not marginal. A WebGPU kernel over the fixed 40-byte preimage
measured ~290 MH/s against ~5 MH/s on worker threads on one laptop — a 50x gap
that a CPU-only prototype would have hidden, and a number `V7` needs before it
can argue about on-chain verification cost.

Ordering enforces the anti-pre-grinding rule for free. Making the challenge
commit to the ticket's txid means no challenge exists before a ticket is bought,
so work done early is worth nothing. A dependency beats a rule someone has to
remember.

A peer-to-peer swap cannot be made safe on the client. That finding moved into
PROTOCOL.md §5.1 as a requirement on `V3`, because it is the first time the
project has had a concrete, non-theoretical reason to need single-use seals.

## Directions still outside the first version

- A return to a real-time trading-first product or bonding-curve issuance.
- Supply-driven decay that freezes abandoned launches at rich initial emission.
- Creator-configurable economic menus, jackpots, governance tokens and a custom AMM.
- Arbitrary anti-whale caps without evidence; concentration itself must be measured.

Historical rejection of an idea is context, not proof of the replacement's safety.
The review reopens disproved guarantees without silently restoring discarded designs.

## Decisions still requiring work

`E1`–`E5`: replacement economics, discrete schedule, ticket timing, fee/creator
policy and terminal accounting. `V3`/`V6`: actual SDK/wallet/network and reserve
asset. `V7`–`V10`: hash/weight measurements, accepted Bitcoin clock, admission and
recovery, full-cycle costs and batch limits. `PV1`–`PV3`: audience, pilot thresholds
and repeat-use evidence. `GR1`/`LQ1`: separately funded markets, only if justified.
