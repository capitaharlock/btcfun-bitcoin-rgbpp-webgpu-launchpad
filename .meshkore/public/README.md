# btc.fun — MeshKore cluster

Local-first, single-operator MeshKore cluster. There is nothing to "join" yet —
admission is `pubkey` / `manual` (see `cluster.yaml`), and no members are
authorized besides the operator's own machines.

To work in this repo as an AI agent, read `AGENT_INSTRUCTIONS.md` first.
To add this project to an Architect, see the MeshKore standard §10.3 —
this repo only needs its `.meshkore/` files; no daemon runs from here.
