---
id: TC2
title: "Metadata validation and image storage"
status: backlog
priority: medium
owner: rjj
category: token-creation
initiative: token-launch
created: 2026-09-23
updated: 2026-09-24
---

Validate launch metadata and decide where the image lives (`PROTOCOL.md` §7, §13). There is no creator allocation or escrow under the standard.

## Execution

- Phase: 2.
- Prerequisites: `TC1`.

## Done when

- Metadata is validated before it is hashed into the mint script's args, and cannot change the terms or script identity afterwards.
- Image storage — on-chain cell, the app's storage or a content-addressed network — is chosen with cost and availability recorded, and the image is checked against its hash when shown.
- Wallets that do not read the metadata still show the balance under the type hash.
