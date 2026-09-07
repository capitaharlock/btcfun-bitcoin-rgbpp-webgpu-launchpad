---
id: LB8
title: "Create-your-token wizard"
status: done
priority: high
owner: rjj
category: web
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---
Turn the emission lab into step three of a four-step wizard that signs a launch commitment: identity, access, emission, commit. The commitment binds symbol, schedule, ticket price and a future opening height under the creator's key. Precursor to `TC1`.

## Done when

- The opening height is always in the future, so a creator cannot mine ahead of announcing.
- The difficulty slider states what it costs in time on a CPU and a GPU.
- `/lab` still works and keeps its `E1`/`E4` evidence role.
- The screen states that nothing is registered on chain yet.
