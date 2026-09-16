---
id: public-docs
title: "Public documentation with flow diagrams"
status: active
priority: high
oneliner: "A documentation area in the portal that explains, for users and engineers, how the contract, the mint, delivery, transfers, ownership and the order book work — with designed flowcharts of every circuit."
modules:
  - docs
  - design
  - web
target: "Testnet demo — a visitor understands every circuit from the portal alone"
created: 2026-09-24
updated: 2026-09-24
owner: rjj
related: [onchain-tokens, web-app]
---

# Public documentation with flow diagrams

## Why this exists

btc.fun is a technical project: its value is that every token is a real RGB++
asset whose rules a script enforces. A visitor should be able to see, without
reading the code, where a token lives, what each transaction carries, when the
tokens are delivered, what authorises a transfer and how a sale settles without
the seller online. `PROTOCOL.md` says it for engineers; the portal must say it
for everyone.

## Approach

- A `Docs` area reached from the footer, written at user level with a
  technical layer for those who want it, sourced from `PROTOCOL.md` and the
  decisions so it never contradicts them.
- Flowcharts in the standard notation — rounded terminals, rectangular steps,
  diamond decisions, transaction blocks — on a white canvas in a soft pastel
  palette derived from the site's design tokens. White in both themes: a
  diagram reads best on paper.
- Diagrams are SVG built from data in the repo, so they are versioned, crisp at
  any size and reviewable in a diff.
- Documentation stays aligned by rule: each page lists the sources it
  describes, and a check fails the deploy when a source changed after its page.

## Done when

- The docs area covers: technologies, the mint script, ticket → mine → mint,
  when tokens are delivered, transfers, ownership and seals, the order book, the
  platform fee, verification and what testnet means.
- The mint, transfer and sale circuits each have a flowchart and a transaction
  anatomy diagram (Bitcoin inputs/outputs, the OP_RETURN commitment, CKB cells).
- The docs check runs before every deploy and fails on a stale page.

## Tasks

| ID | Title | Status |
|---|---|---|
| DC1 | Docs area in the portal, reached from the footer | done |
| DC2 | Flowchart kit on the site's pastel palette | done |
| DC3 | The mint circuit and its transaction anatomy | done |
| DC4 | Transfer, ownership and the order-book circuits | done |
| DC5 | Documentation stays aligned with the code | done |
