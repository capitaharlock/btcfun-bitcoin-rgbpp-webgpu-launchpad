/* The official launches on testnet, mined for real and published to the index.
 *
 *   node scripts/rgbpp/seed.mjs <step>
 *
 *   announce   sign the official launches and publish them to the index
 *   history    publish the live run's launch and its mint, transfer and sale
 *   advance    one pass over every launch: ticket, arm, mine and mint as its
 *              cells allow, announcing each mint; `--loop` repeats until every
 *              launch has minted ROUNDS times (default 2)
 *   refresh    re-sign the official launches with their links, story and image
 *   market     Alice lists token cells and Bob bids, both signed, nothing spent
 *   transfers  send a fifth of each settled balance to the shared demo wallet,
 *              announcing each transfer
 *   fund       pay FUND sats (default 60,000) from Alice to the demo wallet
 *   gather     move Bob's free coins to Alice, who funds the runs
 *   status     where every launch stands
 *
 * Alice creates and promotes every official launch, so each ticket's promoter
 * share comes back to the wallet that buys it: a round costs the platform's
 * share, the paymaster when a cell is new, and Bitcoin fees. Everything here goes
 * through the app's own code and the real services; the index only hears about
 * what the chain already has. INDEX sets where events go (default: the
 * deployed site).
 */

import { close } from "./kit.mjs";
import { ROUNDS, state } from "./seed/state.mjs";
import { advance } from "./seed/steps/advance.mjs";
import { announce } from "./seed/steps/announce.mjs";
import { fund, gather } from "./seed/steps/funds.mjs";
import { history } from "./seed/steps/history.mjs";
import { market } from "./seed/steps/market.mjs";
import { refresh } from "./seed/steps/refresh.mjs";
import { status } from "./seed/steps/status.mjs";
import { transfers } from "./seed/steps/transfers.mjs";

// In the order the usage above lists them, which is the order printed on a bad step.
const steps = { announce, history, advance, refresh, market, transfers, fund, gather, status };

const [name, flag] = process.argv.slice(2);
if (!steps[name]) {
  console.log(`steps: ${Object.keys(steps).join(", ")}`);
} else {
  try {
    if (name === "advance" && flag === "--loop") {
      for (;;) {
        await steps.advance();
        if (state.launches.every((c) => (state.rounds[c.id] ?? 0) >= ROUNDS)) break;
        await new Promise((r) => setTimeout(r, 90_000));
      }
    } else {
      await steps[name]();
    }
  } finally {
    await close();
  }
}
