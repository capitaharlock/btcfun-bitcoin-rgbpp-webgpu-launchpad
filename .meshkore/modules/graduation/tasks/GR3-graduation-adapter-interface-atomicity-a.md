---
id: GR3
title: "Activation adapter, atomicity and recovery"
status: backlog
priority: high
owner: rjj
category: graduation
initiative: graduation-protocol
created: 2026-09-23
updated: 2026-09-23
---

Define unsigned market-activation actions and failure recovery for the selected venue; identify whether an actual cross-chain leap is involved.

## Execution

- Phase: 5.
- Prerequisites: `GR2`.

## Done when

- Failed/partial activation preserves holder backing and leaves a recoverable state.
- Permissionless exit and authority boundaries are verified; no adapter has implicit custody.
- New scripts or changed economic behavior receive independent review before real-fund use.
