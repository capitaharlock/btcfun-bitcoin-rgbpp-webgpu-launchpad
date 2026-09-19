import { ACTIVE } from "../../../lib/bitcoin/network";
import { Technical } from "../../parts";

export default function TestnetPage() {
  return (
    <>
      <section>
        <h2>Test networks only</h2>
        <p>
          Everything on btc.fun runs on <strong>Bitcoin {ACTIVE.label}</strong> and <strong>CKB testnet</strong>. Test
          coins are free and worth nothing, and so are the tokens minted with them. Nothing here points at Bitcoin mainnet,
          and nothing has been reviewed for real money. Please do not send real bitcoin to any address shown in the app.
        </p>
        <p>
          We use testnet3 because it is the network the public RGB++ services verify: payments, tickets and tokens all live
          on the same chain.
        </p>
      </section>

      <section>
        <h2>What is real</h2>
        <ul>
          <li>
            The <strong>mint script</strong> is deployed on CKB testnet, and its tests — including weak hashes, unpaid
            tickets, work done against another ticket, a ticket used twice and wrong amounts — are run against the real CKB virtual machine.
          </li>
          <li>
            Tickets, mints, transfers and sales are built as <strong>real RGB++ transactions</strong>: the app signs real
            Bitcoin transactions and hands the CKB side to the public RGB++ queue.
          </li>
          <li>
            The reward the page shows while you mine uses the same function, with the same test vectors, as the script.
          </li>
          <li>Any mint can be re-checked from the two chains on the Proof page.</li>
        </ul>
      </section>

      <section>
        <h2>What is only an example</h2>
        <p>
          Every launch starts at halving 0, so the front page also shows a few <strong>simulated</strong> launches further
          along — two halvings in, nine, spent — to show what a card will say later. Each is badged SIMULATED and sits in
          its own Examples section; its MINE button and explorer links are switched off, and its figures are the sum of an
          invented mint history at the standard reward. None of it exists on chain. Token pictures are the creator's signed
          choice, or the platform's own artwork where it says so; neither is part of the token's identity.
        </p>
      </section>

      <section>
        <h2>What has not happened yet</h2>
        <ul>
          <li>
            The complete path — ticket, mint, transfer and sale through the RGB++ queue with real wallets — has not yet been
            run end to end on testnet. Until it has, no mint through the app is claimed as done.
          </li>
          <li>It is not yet confirmed that an RGB++ explorer shows a minted balance under the token's identity.</li>
          <li>
            There is no confirmation policy yet, and no stated treatment of a Bitcoin reorganisation after CKB accepted a
            transaction.
          </li>
          <li>Only the app's own wallet is supported.</li>
          <li>No independent review of the protocol or the script has taken place.</li>
        </ul>
      </section>

      <section>
        <h2>What was withdrawn</h2>
        <p>
          Earlier designs promised things the current one does not, and they are gone on purpose: capital protection, a
          price floor that rises by itself, a fixed cap with pari-mutuel sharing, a reserve funded by tickets with
          redemption, and treating the number of addresses as the number of people. A ticket buys a chance to mine, and a
          token is worth what someone will pay for it.
        </p>
        <Technical>
          <ul>
            <li>
              The canonical list of what is implemented, pending and absent is <code>.meshkore/docs/capabilities.md</code>{" "}
              in the repository; <code>PROTOCOL.md</code> §2 lists what was withdrawn.
            </li>
            <li>
              Testnet4 has no Bitcoin SPV client on CKB, and the Signet RGB++ service was unreachable when checked, which is
              why the whole app runs on testnet3.
            </li>
            <li>
              Proof-of-work here distributes application tokens. It does not secure Bitcoin, and a ticket does not
              guarantee a result worth its cost.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
