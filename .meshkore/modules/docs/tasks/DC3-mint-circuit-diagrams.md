---
id: DC3
title: "The mint circuit and its transaction anatomy"
status: backlog
priority: high
owner: rjj
category: docs
initiative: public-docs
created: 2026-09-24
updated: 2026-09-24
---

Flowchart of open → ticket → mine → mint, with the decisions the mint script
takes (ticket paid to promoter and platform, anchor valid, work ≥ 16 bits,
amount exact), and anatomy diagrams of the ticket and mint transactions: the
Bitcoin inputs and outputs, the OP_RETURN commitment, and the CKB cells before
and after. Explains when tokens are delivered and where their data lives.

## Done when

- Both diagrams are on the mint page and agree with `PROTOCOL.md` §4 and §6.
