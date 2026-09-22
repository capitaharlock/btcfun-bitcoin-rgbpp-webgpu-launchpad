import { Diagram } from "../../../components/diagram/Diagram";
import { group } from "../../../lib/format";
import { SEAL_SATS } from "../../../lib/rgbpp/operations";
import { FUNDS_POLL_MS } from "../../../hooks/useMiningLoop";
import { MIN_FAST_FEE_RATE } from "../../../lib/bitcoin/provider";
import { ANCHOR_GRACE_BLOCKS, MIN_CLZ, NEW_CELL, PLATFORM_PERCENT, REUSE, TICKET_SATS } from "../../../lib/standard";
import { DocLink, Technical } from "../../parts";
import { CIRCUIT, MINER_CELL, MINT_TX, TICKET_TX } from "./diagrams";

export default function MintPage() {
  return (
    <>
      <section>
        <h2>Four steps, one payment</h2>
        <ol>
          <li>
            <strong>Ticket.</strong> You sign one Bitcoin transaction that pays {group(TICKET_SATS)} sats — always the same
            price — plus the network fee. It is the round's only payment. It moves your <em>miner cell</em>, a small
            record on CKB that belongs to one of your Bitcoin outputs, to a new output of that transaction: that output is
            your mining challenge, and nobody could have worked on it before you paid. The first time on a launch you have
            no miner cell, so the ticket creates it, and {group(NEW_CELL.paymaster)} of the price pays the RGB++ paymaster
            for its room on CKB.
          </li>
          <li>
            <strong>Arm</strong> — only when the ticket created the cell, and while you mine. Nothing on CKB can check a
            transaction that spends no sealed output, so the new cell starts <em>paid</em>, and a second transaction arms
            it once the ticket has one confirmation. It pays nothing but the network, carries the ticket so the mint
            script can check what it paid, and names the ticket as the cell's challenge — so the work you did before it
            still counts.
          </li>
          <li>
            <strong>Mine.</strong> Your browser searches for a number (a <em>nonce</em>) that makes the hash of the
            challenge start with as many zero bits as possible. The page shows what your best hash so far would mint. You
            can stop after a minute or keep going for days: a ticket has no expiry. <strong>Start</strong>,{" "}
            <strong>Pause</strong> and <strong>Continue</strong> drive one search: the page keeps, per ticket, how many
            nonces have been tried and the best hash found, so a pause or a reload picks up where it stopped. The challenge
            is fixed by your ticket; more time only means more chances at a stronger hash.
          </li>
          <li>
            <strong>Mint.</strong> You sign a Bitcoin transaction that spends the ticket's output and pays only the
            network. The tokens it mints are created in an output of that transaction, which you control. On a first mint
            the miner cell's room becomes your token cell, so the next round's ticket creates a new one; from the third
            round on, the ticket re-arms the cell you have and no paymaster is paid.
          </li>
        </ol>
        <p>
          On a launch page the big <strong>Mine</strong> button turns the token's header into a wizard. Its steps —
          wallet, ticket, mine, mint — sit side by side and one fills the box at a time; a bar under it holds every
          action: <strong>Back</strong> on the left, and on the right what the step asks for, each button naming
          what it authorizes and its cost — <strong>Pay ticket · N sats</strong>, <strong>Start mining</strong> or{" "}
          <strong>Pause</strong>, <strong>Activate ticket · N sats fee</strong> (the page's name for the arming),{" "}
          <strong>Use this hash → Mint</strong>, <strong>Mint X tokens · N sats fee</strong>. Each step on the rail says
          how far it has got — confirmed (green), in the mempool (cyan), waiting for you, or later — and a line under
          the rail lists the round's transactions the same way, beside the step count. Nothing is signed without that press, whatever the
          wallet: the demo and browser wallets sign on it, a passkey wallet asks for the passkey. Each finished step keeps
          its trace: the Bitcoin transaction, a link to it on mempool.space, and whether it is still landing or has
          settled. The mint's trace also links to its proof.
        </p>
        <p>
          The ticket step shows the bill before you sign: promoter, platform, paymaster when the round creates the cell,
          the network fee, the total, and, apart, what the arming and the mint will cost in network fees. The wallet must
          hold all of it before the ticket can be signed: a ticket paid without the fees to mint it would be lost. If it
          does not, the step says how much is missing, shows the address and faucets, and re-reads the balance every{" "}
          {FUNDS_POLL_MS / 1000} seconds. Every mining transaction pays the larger of {MIN_FAST_FEE_RATE} sat/vB and
          mempool.space's “fastest” rate, and its size is estimated by the same rule that signs it.
        </p>
        <p>
          Mining never waits for a block: the challenge is the ticket's output 1 and exists as soon as the ticket is
          broadcast. The wizard keeps the ticket step on screen until you press <strong>Go mine</strong>, and the arming,
          when the round needs one, is offered during mining once the ticket has confirmed. Only minting waits — for the
          armed cell to land on CKB, because the mint spends it. The frame keeps one height whatever the step, with the
          bar under it. The step the loop stands on is decided
          by the chain, not by the page: reload it or open it in another tab and it shows the same step. Minted tokens
          show in your wallet as landing until their own block.
        </p>
        <p>
          On this testnet showcase the site offers its miner on one launch, the platform's DEMO, so everyone's tickets and
          hashes land in the same place; every other launch shows its <strong>Mine</strong> button greyed out and its page
          points to DEMO. That is this site's choice, not a rule of the token: the mint script accepts a paid ticket and a
          valid hash for any launch. A ticket you already hold on another launch can still be mined and minted.
        </p>
        <Diagram spec={CIRCUIT} />
        <p>
          The diamonds are the checks the mint script makes on CKB. The app runs the same arithmetic to show you the
          reward, but it is the script that decides: a ticket that does not pay both shares, or whose anchor is too old, is
          never armed, and a mint with too little work or the wrong amount mints nothing. The split is fixed there too:{" "}
          {PLATFORM_PERCENT} % of what the ticket leaves after the paymaster goes to the platform — {group(NEW_CELL.platform)}{" "}
          or {group(REUSE.platform)} sats — and the rest, {group(NEW_CELL.promoter)} or {group(REUSE.promoter)}, to the
          promoter.
        </p>
      </section>

      <section>
        <h2>When are the tokens delivered?</h2>
        <p>
          The moment you sign the mint, the amount is fixed: it is written into the transaction, and the transaction can
          only succeed with exactly that amount. The tokens <strong>exist</strong> once two things have happened:
        </p>
        <ol>
          <li>the mint's Bitcoin transaction is confirmed in a block, and</li>
          <li>
            the RGB++ queue has delivered the matching CKB transaction, with a proof of that Bitcoin transaction, and CKB
            has accepted it.
          </li>
        </ol>
        <p>
          Between those moments the app shows the operation as <strong>landing</strong>: first “broadcast — waiting for its
          Bitcoin confirmation”, then “the RGB++ queue is completing it on CKB”. How long that takes depends on the next
          Bitcoin block and on the queue; it has not yet been measured on a live testnet run. Mining can start as soon as the
          ticket is broadcast, because its output exists from that moment, but minting waits until the armed cell has
          landed on CKB, because the mint spends it.
        </p>
        <p>
          Nothing in a mint depends on <em>when</em> it confirms. The rate was fixed by the ticket, so a mint that confirms
          late — even after a halving — is exactly as valid as one that confirms at once. That is deliberate: once a
          Bitcoin transaction spends a sealed output, the CKB transaction it commits to is the only way those cells can
          ever move again, so it must never be able to become invalid while it waits.
        </p>
      </section>

      <section>
        <h2>The miner cell</h2>
        <p>
          The miner cell is the ticket's memory. Its data is 13 bytes: whether it is paid, armed or idle, the nonce of your
          last mint, and the <em>anchor</em> — the block height that fixes your current ticket's rate. A cell armed from
          paid adds 32: the ticket's txid, whose output 1 is its challenge.
        </p>
        <Diagram spec={MINER_CELL} />
      </section>

      <section>
        <h2>Inside the transactions</h2>
        <p>
          Every step is a pair: a Bitcoin transaction you sign, and a CKB transaction it commits to. The Bitcoin
          transaction's first output is an <code>OP_RETURN</code> carrying a hash of the CKB transaction; CKB accepts that
          CKB transaction only with a proof that this Bitcoin transaction exists. The dashed lines show which Bitcoin
          output each CKB cell is sealed to.
        </p>
        <Diagram spec={TICKET_TX} />
        <Diagram spec={MINT_TX} />
        <Technical>
          <ul>
            <li>
              Output order in every operation (<code>lib/rgbpp/operations.ts</code>): the commitment at 0, then the seals
              in the order the plan lists them, then payments, then change. Each seal carries {group(SEAL_SATS)} sats.
            </li>
            <li>
              The miner cell and the tokens are sealed to <em>different</em> outputs. A UTXO carrying both would force
              every later transfer to move the miner cell too, and a wallet that spent it without doing so would strand the
              cell.
            </li>
            <li>
              Miner cell data: <code>state u8 ‖ nonce u64 LE ‖ anchor u32 LE [‖ ticket txid 32]</code>, state 0 idle, 1
              armed, 2 paid; only an armed cell may carry the ticket txid, and only the arming of a paid cell may write it,
              equal to that cell's seal. Arming writes <code>state = 1</code> and <code>anchor</code> — the tip the wallet
              saw at the ticket, or at the arming if that one is too old to confirm in time; the script accepts that
              anchor only if it is no earlier than the launch's opening height, no later than the block that confirms the
              arming (proven by the Bitcoin SPV client on CKB), and at most {ANCHOR_GRACE_BLOCKS} blocks before it.
            </li>
            <li>
              A paid cell is created by a ticket that spends no sealed output, so the script cannot check that ticket when
              the cell appears. It checks it when the cell is armed: the arming spends the paid cell's output 1, and carries
              the ticket, without its witness data, as the first witness past the inputs — where the RGB++ queue leaves it
              as written. It must hash to the txid the cell is sealed to and pay the new-cell split. A paid cell cannot
              move, cannot be created beside an RGB++ input, and is armed alone, so one payment arms one cell.
            </li>
            <li>
              A mint consumes an armed cell and returns it idle with the nonce — or, on a first mint, turns its capacity
              into the token cell and carries the nonce as the first witness past the inputs. The script recomputes the challenge from
              the ticket the consumed cell names, or else the outpoint it was sealed to, the hash from the nonce, requires at least {MIN_CLZ} leading
              zero bits, and requires the launch's xUDT balance to grow by exactly{" "}
              <DocLink to="tokenomics">the standard reward</DocLink> at the ticket's anchor. A mint that re-arms is
              refused: that would bring the anchor check back into a transaction carrying a balance.
            </li>
            <li>
              The search is resumable because it is a single sweep of the nonce space from 0 upwards: the GPU dispatches
              consecutive ranges, and CPU workers interleave (worker <i>i</i> of <i>n</i> tries every <i>n</i>th nonce from{" "}
              <i>i</i>), so everything below the slowest worker's position has been tried. That position and the best
              nonce are kept in the browser per ticket outpoint; the kept nonce is hashed again before it is offered for a
              mint.
            </li>
            <li>
              A first ticket needs no CKB of your own: the RGB++ paymaster provides the cell's capacity for its fee, paid
              in the same Bitcoin transaction out of the ticket's price. A paymaster asking more than{" "}
              {group(NEW_CELL.paymaster)} is paid the difference on top, on its own line; the split never changes.
            </li>
            <li>
              The queue waits for the Bitcoin confirmation, attaches the SPV proof, writes the real txid where the plan
              had a placeholder, and submits. It cannot change what was committed; anyone could complete the same CKB
              transaction with a proof from another source.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
