---
id: browser-qa
title: Browser quality campaign
status: active
priority: high
oneliner: "Every user journey exercised in a real browser — right paths and wrong ones, simulated time and real testnet4 money."
modules:
  - web
target: Phase 0/1 — before the prototype is handed to anyone to try
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [testnet-spike, interface-prototype, web-app]
---
# Browser quality campaign

## Why this exists

Unit tests prove the rules; they do not prove that a person can follow the
screens from an empty browser to a token in their wallet. Before the prototype
is handed to anyone, every journey has to be walked in a real browser — the
path that works, and every path that must be refused — and the experience
judged along the way.

## Approach

Two ways of running the same journeys.

**Simulated chain.** A stand-in for the Bitcoin provider that the tests steer.
Block height is the app's clock, so moving the simulated tip is how a test
lives through a day, a week, the twenty-first day and the end of issuance in
seconds. Every transaction the page signs is captured and parsed, so the suite
checks what *would* have been broadcast — amount, destination, commitment, fee
— without spending anything.

**Live testnet4.** The same journeys with real satoshis, a funded wallet
restored through the wallet page, and a second person in a second browser.
Every transaction is fetched back from mempool.space and checked.

A test that finds a gap drives a product change in the same campaign, so the
suite describes the product as it should behave rather than as it happened to.

## What the campaign produced in the product

- Navigation entries became links; form labels are associated with their fields.
- Every page fits a phone.
- The creation wizard keeps its draft while the visitor goes to get a wallet.
- Holdings can receive tokens from a sender, and resetting a chain asks first.
- Market sales settle between two browsers: the payment names the buyer, and
  the seller's page finds it on chain by itself.
- A freshly opened launch keeps asking for its epoch block until the provider
  serves it, instead of blocking mining for the epoch.

## Task plan

- `#QA1` browser test harness and chain simulator
- `#QA2` navigation, wallet and layout
- `#QA3` creation wizard: correct and incorrect paths
- `#QA4` time simulation: days, weeks and halvings
- `#QA5` tickets, mining and claims
- `#QA6` holdings: send, receive and the rails
- `#QA7` market: two-browser settlement and refusals
- `#QA8` live testnet4 run through the browser
- `#QA9` test results report
