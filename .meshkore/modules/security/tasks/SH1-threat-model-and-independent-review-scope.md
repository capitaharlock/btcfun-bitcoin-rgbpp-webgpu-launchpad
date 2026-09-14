---
id: SH1
title: "Early threat model and independent review scope"
status: backlog
priority: critical
owner: rjj
category: security
initiative: security-hardening
created: 2026-09-23
updated: 2026-09-24
---

Define assets, adversaries and trust boundaries of the standard model: the mint script, the xUDT's owner mode, the RGB++ lock and SPV client, the queue and paymaster services, and the buyer-completed sale.

## Execution

- Phase: 2.
- Prerequisites: `OC2`, `OC5`.

## Done when

- Cover issuance authority, ticket payment, the anchor rule, data availability, service omission or outage and cross-chain finality.
- Identify script-version control, censorship assumptions and the path to complete an operation without btc.fun's services.
- Map each requirement to an attack scenario and evidence; scope the independent review of the mint script (SH6).
