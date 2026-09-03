# MeshKore Standard

This repo applies the MeshKore Standard. The single source of truth is
https://meshkore.com/standard — read it at the start of every session
and apply it throughout.

What this means in practice:
- The .meshkore/ folder follows the canonical layout (standard §2).
- Tasks live at .meshkore/modules/<module>/tasks/<ID>-<slug>.md and
  carry the canonical frontmatter (standard §4). Done tasks move to
  .meshkore/modules/<module>/log/<YYYY-MM>/.
- Docs live at .meshkore/docs/<category>/<file>.md with the canonical
  frontmatter (standard §5) and obey governance rules R1-R6.
- Session logs go to .meshkore/log/<YYYY-MM-DD>.md (prose, no frontmatter).
- The timeline at .meshkore/timeline/<YYYY-MM-DD>.jsonl is machine-only.
- Committed to git (v27): public/, docs/, modules/, roadmap/initiatives/, STANDARD_VERSION.

Hard rules — never:
- Never commit runtime/secret/per-machine state: .meshkore/{.runtime,credentials,agents,timeline,log,queues,uploads,snapshots,scripts}/, state.json, roadmap/state.{json,js}.
- Never edit generated files (state.json, state.js, directory.json).
- Never push to origin without the operator explicitly asking.
- Never create a new top-level module or doc category without first
  declaring the module in cluster.yaml.

Refresh cadence:
- Fetch https://meshkore.com/standard/version once per session (or
  every 24 h, whichever comes first). It returns a single integer; if
  it's higher than .meshkore/STANDARD_VERSION, read the relevant
  section(s) in https://meshkore.com/standard/CHANGELOG.md and apply.
- For layer-specific engineering standards (audit, stack, deploy,
  testing), use the catalog at https://meshkore.com/reference/standards/.

<!-- project-specific extras below this line -->

## First premise — engineering quality outranks scope

This repository is judged as evidence of engineering judgement before it is
judged as a product. Nothing ships half-made: cut scope instead of quality, and
say what was cut. Canonical statement in `.meshkore/context/constraints.md`.

What that means when writing code here:

- **One concept, one implementation.** A second copy of a block is a missing
  module. Before writing something that resembles existing code, import it.
- **Depend on interfaces where a second backend is foreseeable.** Mining
  backends, chain providers and the token ledger are ports with adapters, so the
  CPU/GPU split and the eventual RGB++ settlement swap without touching callers.
- **Use each language and framework as its authors intended.** React state lives
  in providers and hooks, effects clean up after themselves, CSS uses the design
  tokens. No bespoke substitute for a facility the framework already provides.
- **Types describe real states.** Discriminated unions over optional soup; no
  `any`; `strict` stays on. A type that permits an impossible state is a bug.
- **Comments explain why, never what.** The non-obvious choice, the protocol
  reference, the footgun avoided.
- **Every rule that can be tested is tested.** Pure logic — emission, ledger
  validation, encodings, signatures — carries unit tests. UI is verified in a
  real browser before it is called done.
- **Never overstate.** An unverified claim is labelled unverified, in the code
  and in the UI. `PROTOCOL.md` §2 lists what has been withdrawn; do not
  reintroduce it in a component.

## This project

Specification-stage community launchpad exploring Bitcoin-scheduled issuance,
RGB++ ownership, CKB settlement, browser mining and transparent reserves.
The September 23 review superseded the original rising-floor, demand and fairness
claims. Read current requirements rather than implementing historical guarantees.

Read before substantial work:
- `.meshkore/context/overview.md` and the other standing context files.
- `.meshkore/context/idea-evolution.md`, including the review correction.
- `.meshkore/docs/roadmap.md` for gates and prerequisites.
- `PROTOCOL.md` for canonical behavior and open decisions.

**Next task: E1 in economic-validation.** V0 records the completed planning revision.
Then prove the architecture, deliver a minimal independently verifiable testnet demo,
validate community use, and pass the real-fund review gate before commercial release.
First demo: one launch, wallet and CKB-side reserve asset; operator-free recovery and
Proof Explorer included. Automatic graduation and marketplace remain deferred.

Conventions:
- Tasks stay under their declared modules with matching category and one canonical initiative.
- Preserve task IDs and historical ADRs; mark supersession instead of erasing history.
- No code module exists yet. Promote an area to `kind: code` with its actual path when created.
- Do not start a project-local daemon. MeshKore runtime state and snapshots remain gitignored.
