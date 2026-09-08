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

A reader can mistake the original bonding-curve specification for a description
of the current design, because nothing in it says it was superseded. This file
fixes the entry point: what each document is, whether it is current, and what to
read instead.

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

**The original bonding-curve specification.** The brief this project started
from is kept outside the repository, because it describes a product this one
deliberately is not, and a reader finding it beside the current documents would
reasonably take the two for one design.

It described a pump.fun-shaped product on RGB++/CKB: a bonding curve as both
primary issuance and price discovery, graduating into a liquidity venue. The
September 23 design review discarded that loop. The reasoning is in
`idea-evolution.md` §1 and §3: pump.fun works because Solana is fast and cheap,
so on Bitcoin, where a transaction must be worth its cost and its wait, copying
real-time trading copies the one thing the chain cannot support.

What survived from it: the RGB++/CKB substrate, the UTXO-model framing, the
permissionless launch, and the marketplace as an eventual destination. What did
not: bonding-curve issuance, continuous price discovery, and automatic
graduation — the last deferred rather than rejected.

## A note on the snapshots

`.meshkore/snapshots/` holds dated copies taken before large revisions. They are
untracked and exist to make a change reviewable, not to be read as current. A
claim found only in a snapshot has, by construction, been superseded.
