---
id: LB1
title: "Emission lab — integer schedule and dilution counterexample"
status: done
priority: high
owner: rjj
category: web
initiative: interface-prototype
created: 2026-09-23
updated: 2026-09-23
---
Implement `A(n) = floor(M × (1 − 2^(−n/H)))` in Q64.64 BigInt arithmetic with no floating point, and build the scenario simulator that runs turnout shapes against both the uncapped rule and the §4.3 backing-limited candidate. Direct input to `E1` (reproduce the failure) and `E4` (simulate incentives).

## Done when

- Milestone shares match PROTOCOL.md §4.1: 50% / 75% / 87.5% / 98.4%.
- Budgets telescope — re-slicing a range cannot change the total.
- The uncapped rule visibly reduces backing per token under falling turnout.
- The terminal block, where integer underflow ends issuance, is computed and shown.
