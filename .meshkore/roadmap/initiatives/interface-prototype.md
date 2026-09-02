---
id: interface-prototype
title: Interface prototype and design system
status: active
priority: medium
oneliner: "Disposable UX experiment that doubles as evidence tooling for E1, E4 and V7."
modules:
  - design
  - web
target: Phase 0/1 — research and UX, ahead of the economic gate
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [economic-validation, validate-architecture, web-app, provable-trust]
---
# Interface prototype and design system

## Why this exists

The roadmap permits research and disposable UX experiments to run ahead of the
economic gate, while reserving *production* implementation of unresolved
economics until after `E5`. This initiative takes that allowance deliberately:
it establishes the visual and interaction language that `WA1`–`WA6` will
inherit, and it does so by building instruments the earlier gates actually
need rather than mockups that would be thrown away.

Three concrete dividends. The emission lab runs the discrete schedule from
PROTOCOL.md §4.1 in exact integer arithmetic and reproduces the reserve
dilution that `E1` requires, so the counterexample is executable rather than
described. The browser miner is a real SHA-256d grinder that measures
achievable hashrate, which is input to `V7`. And the Proof Explorer forces the
§3 discipline early — stating what each check establishes and what it rests
on — which is much harder to retrofit onto a UI built around a green badge.

The prototype must not imply adopted economics. It carries fixtures, not chain
data, and it repeats the withdrawn-claims list from PROTOCOL.md §2 wherever a
number could be mistaken for a guarantee.

## Done when

- A design system exists with tokens, primitives and a documented dark-first
  rationale, and every later web task can be built from it without redesign.
- The emission lab reproduces `E1`'s dilution counterexample from executable
  integer math, and shows the §4.3 candidate cap alongside it.
- The browser miner reports measured hashrate and best-`clz` distribution on
  real hardware, feeding `V7`.
- No screen claims capital protection, a rising floor, farm immunity or
  settlement trustlessness.

## Task plan

- `#DS1` design language, tokens and component primitives
- `#DS2` mining interaction and settlement-reveal design
- `#LB1` emission lab — integer schedule and dilution counterexample
- `#LB2` browser mining harness and hashrate measurement
- `#LB3` Proof Explorer shell with per-claim trust roots
