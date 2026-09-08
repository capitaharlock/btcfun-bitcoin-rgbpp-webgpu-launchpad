---
id: SH8
title: "Remediate the first external audit"
status: done
priority: critical
owner: rjj
category: security
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---

Act on the technical audit of 23 September 2026 against `25f3709`. Every finding
was reproduced locally before being acted on. Findings, reproductions and
disposition are recorded in [audit-2026-09-23.md](../../../docs/audit-2026-09-23.md).

Nine defects were fixed, two framing gaps were closed with documentation, and
four areas were confirmed open and assigned to existing tasks rather than
papered over.

## Done when

- Every reproducible defect is fixed and carries a regression test naming its
  finding id. — `AUD-07` through `AUD-15`.
- Claims in code and UI match what the code can support. — `verified` →
  `authentic`, "records verified" → "records replayed", settlement requires
  evidence, replay states what it does not check.
- Implemented capability is distinguished from the target architecture in one
  canonical place. — [capabilities.md](../../../docs/capabilities.md).
- The historical specification cannot be mistaken for the current design. —
  [provenance.md](../../../docs/provenance.md) and a banner on the file itself.
- Findings that are scope rather than defects are assigned, not closed. — `E1`–`E5`
  for economics, `V3`/`V8`/`V9` for settlement and admission, `SH7` for custody.

## Notes

The three defects that were hardest to see are worth carrying forward as
review habits, and are written up in the audit document: a fee estimator
tested thoroughly at the wrong boundary; a status word that implied evidence
it did not have; and a rounding direction that every property test tolerated
because monotonicity and telescoping hold under either.

Two general rules came out of it and are now followed in `apps/web`: validate
untrusted input once, at the boundary, with an exhaustive decoder; and never
name a thing more strongly than the code can support.
