---
id: QA7
title: "Market: two-browser settlement and refusals"
status: done
priority: high
owner: rjj
category: code
initiative: browser-qa
created: 2026-09-23
updated: 2026-09-23
---

A complete sale between two browsers on the simulated chain, and every offer or payment the market must refuse.

## Done when

- The seller's page discovers the payment from the chain; the buyer is named by the payment itself.
- Unsigned, tampered, cross-launch, self-paid, unaffordable and expired offers are all refused.
