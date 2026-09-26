---
id: DC3
title: "The mint circuit and its transaction anatomy"
status: done
priority: high
owner: rjj
category: docs
initiative: public-docs
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T15:10:00Z
---

Flowchart of open → ticket → mine → mint, with the decisions the mint script
takes (ticket paid to promoter and platform, anchor valid, work ≥ 16 bits,
amount exact), and anatomy diagrams of the ticket and mint transactions: the
Bitcoin inputs and outputs, the OP_RETURN commitment, and the CKB cells before
and after. Explains when tokens are delivered and where their data lives.

## Done when

- Both diagrams are on the mint page and agree with `PROTOCOL.md` §4 and §6.

## Resolution

`apps/web/src/docs/pages/mint/diagrams.ts`: the open → ticket → mine → mint flowchart with the mint script's checks (both payments, anchor within 144 blocks, clz ≥ 16, exact amount → armed / rejected / minted), the miner cell's 13-byte data through idle → armed → idle, and the anatomy of the ticket and mint transactions in the output order of `domain/rgbpp/index.ts` (commitment, seals, promoter 9,500, platform 500, paymaster, change) with each CKB cell's seal and the OP_RETURN commitment drawn.
