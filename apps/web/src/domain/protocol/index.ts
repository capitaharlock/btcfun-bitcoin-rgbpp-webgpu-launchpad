/* Public surface of `domain/protocol`. Everything another module may use is named here;
 * the files behind it are internal. */

export { ANCHOR_GRACE_BLOCKS, DECIMALS, HALVING_BLOCKS, MAX_CLZ, MIN_CLZ, NEW_CELL, PAYMASTER_BUDGET_SATS, PLATFORM_PERCENT, REUSE, TICKET_SATS, UNIT, blocksToNextHalving, halvingsAt, reward, split, terminalHalving, ticketChallenge } from "./standard";
export type { Split } from "./standard";
