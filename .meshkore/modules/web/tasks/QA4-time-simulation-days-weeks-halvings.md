---
id: QA4
title: "Time simulation: days, weeks and halvings"
status: done
priority: high
owner: rjj
category: code
initiative: browser-qa
created: 2026-09-23
updated: 2026-09-23
---

The schedule observed through the launch page at day 0, 1, 7, 14, 21 and 42, the epoch countdown, a live block arriving without a reload, and the terminal block.

## Done when

- Expected values come from `1 − 2^(−n/H)`, not from the app's own code.
- Epoch allowance halves every 1,008 blocks and is zero past the terminal block.
