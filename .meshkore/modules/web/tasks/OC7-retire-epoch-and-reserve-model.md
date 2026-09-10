---
id: OC7
title: "Retire the epoch and reserve model from the product"
status: backlog
priority: high
owner: rjj
category: web
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
---

Remove epoch budgets, pari-mutuel allocation, claims, reserve and redemption
from code, copy and the creation wizard, which now asks only for identity and
the promoter's address.

## Done when

- No screen, test or comment describes a cap, an epoch allocation or a floor.
- The creation wizard has no economic parameter.
- The browser suite passes against the new model.
