---
id: DC2
title: "Flowchart kit on the site's pastel palette"
status: done
priority: high
owner: rjj
category: design
initiative: public-docs
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T15:10:00Z
---

A small SVG diagram component set for the docs: terminal (rounded), process
(rectangle), decision (diamond), transaction (a block listing inputs and
outputs), cell, lanes per actor or chain, and orthogonal connectors with
labels. White canvas in both themes; a pastel palette derived from the site's
design tokens; readable at phone width.

## Done when

- Diagrams are declared as data and render crisply at any width.
- Colours come from the design tokens; contrast of labels passes WCAG AA.

## Resolution

`apps/web/src/components/diagram/`: `model.ts` (diagrams as data — lanes, terminal/process/decision/note/cell/transaction nodes, flow/yes/no/seal/commit edges), `layout/` (pure geometry: row stacking, orthogonal routing with nested gutters, byte strips — `sizing.ts`, `routing.ts`, `types.ts`, the whole-diagram pass in `index.ts`), `text.ts` (DOM-free wrapping), `Diagram.tsx` (SVG with `role="img"`, title and description, arrowheads, legend for dashed relations, sideways scroll inside the card below 78 % scale), `nodes.tsx` (the node painters) and `diagram.css`. The pastel palette is `--dg-*` tokens in `src/ui/tokens.css`, mixed from the site's accents on a white card in every theme. `layout.test.ts` covers routing, gutters, wrapping and overlap; the browser suite checks every label for WCAG AA contrast against the shape it sits on.
