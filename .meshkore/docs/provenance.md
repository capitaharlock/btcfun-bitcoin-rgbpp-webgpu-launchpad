---
title: Where the documents came from, and which one is current
category: docs
tags: [history, scope]
updated: 2026-09-23
owner: rjj
status: active
related: [validate-architecture]
---

# Provenance

The audit of 23 September 2026 found that a reader could mistake the original
bonding-curve specification for a description of the current design, because
nothing in it says it was superseded (`AUD-02`). This file fixes the entry
point: what each document is, whether it is current, and what to read instead.

## Canonical, in reading order

1. **`PROTOCOL.md`** — current behaviour and open decisions. The only document
   that describes what the protocol *is*. Its `§2` lists claims that have been
   withdrawn; anything contradicting it is historical.
2. **`.meshkore/docs/capabilities.md`** — what is implemented today, as against
   what the protocol describes. Read it before believing any screen.
3. **`.meshkore/docs/roadmap.md`** — the gates between the two, and their order.
4. **`.meshkore/context/idea-evolution.md`** — why the design is what it is,
   including the directions already tried and rejected. The only place in
   `context/` that keeps history.

## Superseded

**`tmp/bitcoin-rgbpp-bonding-curve-project.md`** — the original project
specification. Untracked: it is the operator's copy of the brief the project
started from, kept for traceability, not as a design document.

It describes a pump.fun-shaped product on RGB++/CKB: a bonding curve as both
primary issuance and price discovery, graduating into a liquidity venue. The
September 23 review discarded that loop. The reasoning is in
`idea-evolution.md` §1 and §3: pump.fun works because Solana is fast and cheap,
so on Bitcoin, where a transaction must be worth its cost and its wait, copying
real-time trading copies the one thing the chain cannot support.

What survived from it: the RGB++/CKB substrate, the UTXO-model framing, the
permissionless launch, and the marketplace as an eventual destination. What did
not: bonding-curve issuance, continuous price discovery, and automatic
graduation — the last deferred rather than rejected.

The file now carries a banner saying so. Treat any passage in it as history
unless `PROTOCOL.md` repeats it.

## A note on the snapshots

`.meshkore/snapshots/` holds dated copies taken before large revisions. They are
untracked and exist to make a change reviewable, not to be read as current. A
claim found only in a snapshot has, by construction, been superseded.
