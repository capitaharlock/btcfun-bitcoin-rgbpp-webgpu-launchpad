/* The official launches: who they are and what each one is for.
 *
 * Data only. `announce` signs OFFICIAL into launches; `refresh` adds the
 * EXTRAS (reference link, story and picture) to the ones already announced.
 */

/** Bitcoin culture, not anyone's brand: themes the community shares, issued by nobody in particular. */
export const OFFICIAL = [
  ["DEMO", "Demo Token", "Start here: buy a ticket, mine in your browser and mint real tokens on testnet.", "var(--lime)"],
  ["PIZZA", "Pizza Day", "Ten thousand coins, two pizzas: the first thing Bitcoin ever bought.", "var(--amber)"],
  ["GENESIS", "Genesis Block", "For everyone who has read the headline in block zero.", "var(--cyan)"],
  ["HODL", "Hodl Guild", "A typo in 2013, a creed ever since. The token for the patient.", "var(--magenta)"],
  ["LASER", "Laser Eyes", "The profile-picture movement, now a token you mine.", "var(--violet)"],
  ["STACK", "Stack Sats", "Small, steady, every week. For the savers' circle.", "var(--mint)"],
  ["ORANGE", "Orange Pill", "For the friends who explained it one more time.", "var(--warn)"],
  ["NODE", "Node Runners", "For the people who validate every block themselves.", "var(--cyan)"],
  ["HALVING", "Halving Night", "Four years, half the reward, one long night.", "var(--amber)"],
  ["CYPHER", "Cypherpunks", "Privacy, open code and the mailing list that started it.", "var(--violet)"],
  ["TIMECHN", "Timechain", "Block by block, the clock nobody can stop.", "var(--mint)"],
];

/** Reference pages, a story and a picture per launch. Links point at neutral
 *  references, never at a project that has not asked to be represented; the
 *  pictures are the platform's own artwork in public/tokens/. */
export const EXTRAS = {
  DEMO: ["https://btcfun.rjj.workers.dev/#/docs", "A token that exists to be tried: every step is the real contract on testnet.", "Nothing to fund: tickets pay the platform's own promoter wallet and come back to the demo runs.", "/tokens/demo.svg"],
  PIZZA: ["https://en.wikipedia.org/wiki/Bitcoin_Pizza_Day", "Every community has a first purchase story; this one funds the next ones.", "Sponsor pizza nights at local meetups where newcomers pay in sats for the first time.", "/tokens/pizza.svg"],
  GENESIS: ["https://en.bitcoin.it/wiki/Genesis_block", "Reading the source is the best onboarding there is, and study groups need a place and a projector.", "Run a monthly reading group through the whitepaper and the genesis block, with the notes published.", "/tokens/genesis.svg"],
  HODL: ["https://en.wikipedia.org/wiki/Hodl", "Long-term holders are the quiet majority and rarely have a shared place.", "Keep a public, plain-language guide to self-custody and cold storage, updated every halving.", "/tokens/hodl.svg"],
  LASER: ["https://en.wikipedia.org/wiki/Laser_eyes", "The meme travels further than any explainer; artists who make it deserve a tip jar.", "Commission pixel art from community artists and release it under an open licence.", "/tokens/laser.svg"],
  STACK: ["https://en.bitcoin.it/wiki/Satoshi_(unit)", "Saving small and often is how most people start, and they learn best together.", "Run a weekly savings challenge with a shared dashboard and small prizes paid in sats.", "/tokens/stack.svg"],
  ORANGE: ["https://bitcoin.org/en/getting-started", "Explaining Bitcoin well takes time, printed material and patience.", "Print and translate a one-page beginner guide and hand it out at events.", "/tokens/orange.svg"],
  NODE: ["https://bitcoin.org/en/full-node", "A node on every desk makes the network stronger; hardware is the obstacle.", "Subsidise low-power node kits for community members and publish uptime monthly.", "/tokens/node.svg"],
  HALVING: ["https://en.bitcoin.it/wiki/Controlled_supply", "The halving is the calendar the community keeps; it deserves a party.", "Host a halving-night stream and meetup with talks from local builders.", "/tokens/halving.svg"],
  CYPHER: ["https://en.wikipedia.org/wiki/Cypherpunk", "Privacy tools are built by volunteers who are rarely paid for the work.", "Fund small bounties for documentation and translations of open privacy tools.", "/tokens/cypher.svg"],
  TIMECHN: ["https://en.bitcoin.it/wiki/Block_timestamp", "Blocks are the clock; a public screen showing them teaches more than a slide.", "Build a block-clock display for the community space and publish the design.", "/tokens/timechn.svg"],
};
