---
id: LB3
title: "Proof Explorer shell with per-claim trust roots"
status: done
priority: high
owner: rjj
category: web
initiative: interface-prototype
created: 2026-09-23
updated: 2026-09-23
---
Build the evidence screen §3 asks for: each claim paired with what it actually establishes and what it rests on, with client-side recomputation where that is genuinely possible and an explicit not-implemented state everywhere else. Precursor to `WA6`.

## Done when

- Challenge encoding and candidate hash are recomputed in the browser.
- Chain canonicality is shown as an assumption, never as a verified fact.
- Unimplemented checks are visually distinct from verified ones.
