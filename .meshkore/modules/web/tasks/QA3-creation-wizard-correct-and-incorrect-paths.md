---
id: QA3
title: "Creation wizard: correct and incorrect paths"
status: done
priority: high
owner: rjj
category: code
initiative: browser-qa
created: 2026-09-23
updated: 2026-09-23
---

Creating a token from the form end to end, and every input the wizard must refuse — symbol shape, reserved symbols, name and description bounds, past opening heights, sub-dust tickets, committing without a wallet.

## Done when

- A committed token appears in the grid and opens for mining when the chain reaches its height.
- The draft survives a detour to the wallet page and lands back on the step that was left.
- The emission step states 50 / 75 / 87.5 % after one, two and three half-lives.
