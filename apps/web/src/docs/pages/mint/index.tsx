import { Diagram } from "../../../components/diagram/Diagram";
import { group } from "../../../lib/format";
import { SEAL_SATS } from "../../../lib/rgbpp/operations";
import { ANCHOR_GRACE_BLOCKS, MIN_CLZ, PLATFORM_FEE_SATS, PROMOTER_SATS, TICKET_SATS } from "../../../lib/standard";
import { DocLink, Technical } from "../../parts";
import { CIRCUIT, MINER_CELL, MINT_TX, TICKET_TX } from "./diagrams";

export default function MintPage() {
  return (
    <>
      <section>
        <h2>Four steps</h2>
        <ol>
          <li>
            <strong>Open.</strong> Once per launch you open a <em>miner cell</em>: a small record on CKB that belongs to
            one of your Bitcoin outputs. It holds no tokens; it is the slot a ticket goes into.
          </li>
          <li>
            <strong>Ticket.</strong> You sign one Bitcoin transaction that pays {group(TICKET_SATS)} sats —{" "}
            {group(PROMOTER_SATS)} to the launch's promoter and {group(PLATFORM_FEE_SATS)} to the platform — and moves
            your miner cell to a new output of that same transaction. That new output is your mining challenge: it did not
            exist before you paid, so nobody could have worked on it in advance.
          </li>
          <li>
            <strong>Mine.</strong> Your browser searches for a number (a <em>nonce</em>) that makes the hash of the
            challenge start with as many zero bits as possible. The page shows what your best hash so far would mint. You
            can stop after a minute or keep going for days: a ticket has no expiry. <strong>Mine</strong>,{" "}
            <strong>Pause</strong> and <strong>Continue</strong> drive one search: the page keeps, per ticket, how many
            nonces have been tried and the best hash found, so a pause or a reload picks up where it stopped. The challenge
            is fixed by your ticket; pausing, reloading or restarting never changes it — more time only means more chances
            at a stronger hash.
          </li>
          <li>
            <strong>Mint.</strong> You sign a Bitcoin transaction that spends the ticket output. The tokens it mints are
            created in an output of that transaction, which you control. The next ticket is a new transaction.
          </li>
        </ol>
        <p>
          On a launch page these steps are a wizard under the token's header. The big <strong>Mine</strong> button in the
          header starts it; without a wallet, the first step asks for one in place — your own, behind a passkey, or the
          shared demo wallet — and the page never leaves the token. Each step is one line saying what is happening now and
          what comes next, and each finished step keeps its trace: the Bitcoin transaction, a link to it on
          mempool.space, and whether it is still landing or has settled. The mint's trace also links to its proof.
        </p>
        <p>
          The step you are on is decided by the chain, not by the page: reload it, open it in another tab or mint
          elsewhere, and it shows the same step. With a wallet of your own every payment waits for your click on{" "}
          <strong>Open miner cell</strong> or <strong>Sign and pay</strong>, next to exactly what it pays. The demo wallet's
          key is public and shared, so once you press <strong>Mine</strong> it opens the cell and pays the ticket by itself,
          and mining starts the moment the ticket is sent. If the wallet lacks the bitcoin a step needs, the step shows the
          full address and faucets, and carries on once the coins confirm. The <strong>Mine</strong> button on a launch's box
          in the catalogue counts as the press and opens the page on the wizard.
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
          never armed, and a mint with too little work or the wrong amount mints nothing.
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
          Bitcoin block and on the queue; it has not yet been measured on a live testnet run. Mining can start as soon as the ticket is
          broadcast, because its output exists from that moment, but minting waits until the armed cell has landed on CKB,
          because the mint spends it.
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
          The miner cell is the ticket's memory. Its data is 13 bytes: whether a ticket is loaded, the nonce of your last
          mint, and the <em>anchor</em> — the block height your current ticket was bought at, which fixes its rate.
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
              Miner cell data: <code>state u8 ‖ nonce u64 LE ‖ anchor u32 LE</code>. The ticket writes <code>state = 1</code>{" "}
              and <code>anchor</code> = the tip the wallet sees; the script accepts that anchor only if it is no earlier
              than the launch's opening height, no later than the block that confirms the ticket (proven by the Bitcoin SPV
              client on CKB), and at most {ANCHOR_GRACE_BLOCKS} blocks before it.
            </li>
            <li>
              A mint consumes an armed cell and returns it idle with the nonce. The script recomputes the challenge from
              the outpoint the consumed cell was sealed to, the hash from the nonce, requires at least {MIN_CLZ} leading
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
              Opening needs no CKB of your own: the RGB++ paymaster provides the cell's capacity for a fee paid in the same
              Bitcoin transaction. A first mint uses the paymaster the same way for the new token cell.
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
