---
id: DS1
title: "Design language, tokens and component primitives"
status: done
priority: medium
owner: rjj
category: design
initiative: interface-prototype
created: 2026-09-23
updated: 2026-09-23
---
Establish the visual language: colour and type tokens, surface and line treatment, the amber/cyan signal split (issuance versus evidence), and the component primitives every later screen is assembled from. Dark-first is a product decision — this is an instrument panel, not a document.

## Done when

- Tokens and primitives live in `apps/web/src/ui/` and are used by every view.
- Numerals are tabular and monospaced everywhere a figure is data.
- Reduced-motion and focus-visible are handled at the base layer.
