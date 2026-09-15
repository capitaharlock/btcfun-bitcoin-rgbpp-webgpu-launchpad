---
id: DC5
title: "Documentation stays aligned with the code"
status: backlog
priority: high
owner: rjj
category: docs
initiative: public-docs
created: 2026-09-24
updated: 2026-09-24
---

Each docs page declares the source files it describes. A check compares the
last commit touching each source with the last commit touching its page and
fails when a source is newer; it runs before every deploy. The project guide
states the rule: a change to a documented behaviour updates its page in the
same change.

## Done when

- `npm run docs:check` exists, runs in the deploy script, and fails on a stale page.
