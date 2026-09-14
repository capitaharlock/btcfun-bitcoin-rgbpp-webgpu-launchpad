---
id: token-launch
title: "Minimal permissionless launch"
status: backlog
priority: high
oneliner: "Create one launch with committed immutable terms and a real wallet."
modules:
  - token-creation
target: "Phase 2 \u2014 Verifiable demo"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [emission-core, mining-engine, web-app]
---

# Minimal permissionless launch

## Why this exists

The first vertical slice needs correct token identity, future-height commitment, creator escrow and a callable SDK, not a broad configuration interface.

## Execution and gate

Use the adopted core and the single wallet/network selected in V3. Additional wallets and creator-configurable economics are deferred.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- A third party creates a launch with the minimal SDK and inspects authorization, denomination and immutable terms.
- No mint can occur before the committed h0 and accepted-clock conditions.
- Creator escrow has defined release and failed/inactive-launch outcomes.

## Task plan

- [`TC1` — Permissionless launch and future-height commitment](../../modules/token-creation/tasks/TC1-launch-transaction-token-factory-and-h0-.md)
- [`TC2` — Metadata validation and image storage](../../modules/token-creation/tasks/TC2-metadata-schema-validation-and-creator-a.md)
- [`TC3` — Minimal launch SDK and preflight](../../modules/token-creation/tasks/TC3-typescript-launch-sdk-preflight-and-expl.md)
