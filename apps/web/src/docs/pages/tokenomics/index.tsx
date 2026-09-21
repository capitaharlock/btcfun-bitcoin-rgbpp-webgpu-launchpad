import { Diagram } from "../../../components/diagram/Diagram";
import type { DiagramSpec } from "../../../components/diagram/model";
import { atoms, group } from "../../../lib/format";
import {
  ANCHOR_GRACE_BLOCKS,
  DECIMALS,
  HALVING_BLOCKS,
  MIN_CLZ,
  NEW_CELL,
  PAYMASTER_BUDGET_SATS,
  PLATFORM_PERCENT,
  REUSE,
  reward,
  terminalHalving,
  TICKET_SATS,
} from "../../../lib/standard";
import { DocLink, Formula, Technical } from "../../parts";

const tokens = (clz: number, halvings: number) => atoms(reward(clz, 0, halvings * HALVING_BLOCKS), DECIMALS, 0);

const REWARD: DiagramSpec = {
  title: "From a ticket to a reward",
  description:
    `A ticket costs ${group(TICKET_SATS)} sats: ${group(REUSE.promoter)} to the promoter and ${group(REUSE.platform)} to the platform, ` +
    `or, when it creates the miner cell, ${group(NEW_CELL.paymaster)} to the RGB++ paymaster, ${group(NEW_CELL.platform)} and ${group(NEW_CELL.promoter)}. ` +
    `Its output gives the challenge and its anchor height fixes k, the number of halvings since the launch opened. ` +
    `Mining gives clz, the leading zero bits of the best hash. Below ${MIN_CLZ} bits nothing is mintable; otherwise the reward ` +
    `is 10^8 × clz² / 2^k atoms, rounded down.`,
  laneWidth: 236,
  lanes: [
    { id: "ticket", label: "The ticket", tone: "amber" },
    { id: "miner", label: "Your miner", tone: "violet" },
    { id: "script", label: "The mint script", tone: "mint" },
  ],
  nodes: [
    { id: "pay", lane: "ticket", row: 0, kind: "terminal", label: `Pay ${group(TICKET_SATS)} sats`, tone: "amber" },
    { id: "split", lane: "ticket", row: 1, kind: "process", label: "Split in the same transaction", detail: `${group(REUSE.promoter)} promoter · ${group(REUSE.platform)} platform`, tone: "amber" },
    { id: "challenge", lane: "miner", row: 1, kind: "process", label: "Challenge", detail: "hash of the ticket's output", tone: "violet" },
    { id: "anchor", lane: "ticket", row: 2, kind: "process", label: "Anchor", detail: "the block height when you bought", tone: "amber" },
    { id: "clz", lane: "miner", row: 2, kind: "process", label: "clz", detail: "leading zero bits of your best hash", tone: "violet" },
    { id: "enough", lane: "script", row: 3, kind: "decision", label: `clz ≥ ${MIN_CLZ}?` },
    { id: "none", lane: "miner", row: 3, kind: "terminal", label: "Not mintable", tone: "rose" },
    { id: "k", lane: "script", row: 4, kind: "process", label: "k halvings", detail: `(anchor − opening) ÷ ${group(HALVING_BLOCKS)}, rounded down`, tone: "mint" },
    { id: "reward", lane: "script", row: 5, kind: "terminal", label: "10⁸ × clz² ÷ 2ᵏ atoms", tone: "mint" },
  ],
  edges: [
    { from: "pay", to: "split" },
    { from: "split", to: "challenge" },
    { from: "split", to: "anchor" },
    { from: "challenge", to: "clz" },
    { from: "clz", to: "enough", fromSide: "right", toSide: "top" },
    { from: "enough", to: "none", kind: "no", fromSide: "left", toSide: "right" },
    { from: "enough", to: "k", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "anchor", to: "k", fromSide: "bottom", toSide: "left" },
    { from: "k", to: "reward" },
  ],
};

export default function TokenomicsPage() {
  return (
    <>
      <section>
        <h2>One standard for every token</h2>
        <p>
          A creator chooses a token's name, symbol, description and the Bitcoin address its ticket income goes to. A
          creator chooses <strong>nothing economic</strong>: not the supply, not the reward, not the ticket price, not the
          halving. Those are protocol constants compiled into the mint script, so two tokens' numbers mean the same thing.
        </p>
      </section>

      <section>
        <h2>The ticket</h2>
        <p>
          A ticket costs <strong>{group(TICKET_SATS)} sats</strong>, always, paid inside the ticket's own Bitcoin
          transaction; network fees are separate. When the round needs a new miner cell,{" "}
          <strong>{group(PAYMASTER_BUDGET_SATS)} sats</strong> of it pay the RGB++ paymaster for the cell's room on CKB. The
          platform takes {PLATFORM_PERCENT} % of what remains, rounded down, and the launch's promoter the rest:
        </p>
        <ul>
          <li>
            a round that creates its miner cell: {group(NEW_CELL.paymaster)} paymaster + {group(NEW_CELL.platform)} platform +{" "}
            <strong>{group(NEW_CELL.promoter)}</strong> promoter;
          </li>
          <li>
            a round that re-arms the cell it has: {group(REUSE.platform)} platform + <strong>{group(REUSE.promoter)}</strong>{" "}
            promoter.
          </li>
        </ul>
        <p>
          A first mint turns the miner cell into your token cell, so a miner's first two rounds create a cell and every
          round after that re-arms one. Either way the ticket is the challenge: mining, and the reward shown for it,
          starts when the ticket is sent, at the rate of the block it was signed at. The platform never holds the promoter's money: each ticket pays them directly, in
          the block it confirms. The mint script arms a ticket only when both payments are present, and the platform's
          address is fixed in the script, so no launch can redirect it. A paymaster asking more than its budget is paid the
          difference on top of the ticket; the split never moves.
        </p>
        <p>
          A ticket buys a chance, not a result. It does not guarantee tokens worth its cost; there is no reserve, no floor
          price and no redemption. Ticket income is the promoter's revenue, and a token is worth what someone will pay for it.
        </p>
      </section>

      <section>
        <h2>The reward</h2>
        <p>
          Mining looks for a hash that starts with many zero bits. The number of leading zero bits is called{" "}
          <code>clz</code>. Each extra bit takes, on average, twice as much work. The reward for a ticket is:
        </p>
        <Formula>{`reward = 10^8 × clz² ÷ 2^k   atoms (8 decimals), rounded down
         if clz ≥ ${MIN_CLZ}; otherwise nothing is mintable

k      = halvings between the launch's opening and the ticket's anchor`}</Formula>
        <p>
          So one whole token per <code>clz²</code>, halved every {group(HALVING_BLOCKS)} Bitcoin blocks (about a week). A{" "}
          {24}-bit hash in the first week mints {tokens(24, 0)} tokens; the same hash in the fourth week mints{" "}
          {tokens(24, 3)}. A 40-bit hash is 65,536 times more work than a 24-bit one and mints about 2.8 times as much —
          the reward grows with effort, but a bigger machine's advantage stays small.
        </p>
        <Diagram spec={REWARD} />
      </section>

      <section>
        <h2>The ticket fixes the rate</h2>
        <p>
          The halving that applies is the one in force when you <strong>bought the ticket</strong>, not when you mint. Your
          wallet records the current block height (the <em>anchor</em>) in the ticket, and the script accepts it only if it
          is no later than the block that confirmed the ticket and at most {ANCHOR_GRACE_BLOCKS} blocks (about a day) before
          it. You can mine for a minute or for ten days; the rate does not change. The launch page shows the current halving,
          because buying the ticket is the moment the rate is set.
        </p>
      </section>

      <section>
        <h2>Supply</h2>
        <p>
          There is <strong>no maximum supply</strong>: mints are independent and can happen in parallel, which a shared
          cap would forbid. Supply is bounded by the halving instead. The reward is a whole number of atoms, and it reaches
          exactly zero once <code>2^k</code> exceeds <code>10^8 × clz²</code> — at halving {terminalHalving(256)} for any
          possible hash, and at halving {terminalHalving(40)} for a 40-bit one. A ticket anchored after that mints nothing.
          Long before then, the ticket price stays the same while what it yields halves every week, so the cost of a token
          doubles weekly.
        </p>
        <p>
          Total supply is simply the sum of every mint. Anyone can add it up from the token cells on CKB; the launch page
          does exactly that rather than trusting a counter.
        </p>
        <Technical>
          <ul>
            <li>
              Constants (<code>PROTOCOL.md</code> §4, <code>lib/standard.ts</code>, <code>contracts/mint-core</code>):
              decimals {DECIMALS}, unit 10^8 atoms, halving {group(HALVING_BLOCKS)} blocks, minimum clz {MIN_CLZ}, ticket{" "}
              {group(TICKET_SATS)} sats, paymaster budget {group(PAYMASTER_BUDGET_SATS)}, platform {PLATFORM_PERCENT} % of the
              rest rounded down, anchor
              grace {ANCHOR_GRACE_BLOCKS} blocks. The Rust and TypeScript reward functions pass the same vectors.
            </li>
            <li>
              <code>10^8 × clz²</code> is below <code>2^43</code> for every possible <code>clz</code>, so it fits a{" "}
              <code>u64</code>, and dividing by <code>2^k</code> is an exact right shift.
            </li>
            <li>
              Both shares stay above the 294-sat dust limit of a P2WPKH output, which Bitcoin nodes would not relay: the
              smaller platform share is {group(NEW_CELL.platform)} sats. The shared vectors check the split to the last
              satoshi in Rust and TypeScript. A transaction arming several miner cells owes the platform one share per cell.
            </li>
            <li>
              Changing the fee or the platform address is a new script version, visible as a new code hash — never a silent
              change to existing launches.
            </li>
            <li>
              Why pricing at the ticket is a safety property, not a convenience: see{" "}
              <DocLink to="mint">the mint circuit</DocLink>.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
