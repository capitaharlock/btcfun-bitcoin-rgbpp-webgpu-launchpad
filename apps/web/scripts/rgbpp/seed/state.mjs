/* The seed's run state, loaded once and shared by every step.
 *
 * `stateFile` reads the file when called, so each module calling it would hold
 * its own copy and the last `write` would drop the others' changes. One module
 * owns it; the steps import `state` and `write` from here.
 */

import { launches, network, stateFile } from "../kit.mjs";

/** How many mints `advance --loop` gives each launch before it stops. */
export const ROUNDS = Number(process.env.ROUNDS ?? 2);

export const { state, write } = stateFile("seed", {
  launches: [],
  rounds: {},
  pending: {},
  published: [],
});

/** A recorded launch's terms on the active network. */
export const launchTerms = (c) => launches.termsOf(c, network.ACTIVE);
