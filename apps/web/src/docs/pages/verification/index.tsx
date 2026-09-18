import { Diagram } from "../../../components/diagram/Diagram";
import type { DiagramSpec } from "../../../components/diagram/model";
import { MIN_CLZ } from "../../../lib/standard";
import { Technical } from "../../parts";

const VERIFY: DiagramSpec = {
  title: "What the Proof page checks",
  description:
    "Given a mint's Bitcoin transaction id, the Proof page fetches that transaction from a Bitcoin provider, asks the RGB++ " +
    "service which CKB transaction it settled as, and fetches that CKB transaction and the cells it consumed from a CKB node. " +
    `It then checks, from that raw data: the OP_RETURN commits to exactly this CKB transaction; an armed miner cell was consumed; ` +
    `the hash of the ticket's challenge and the nonce has at least ${MIN_CLZ} leading zero bits; and the balance grew by exactly ` +
    "the standard reward. Any failing check is named.",
  lanes: [
    { id: "page", label: "Proof page", tone: "violet" },
    { id: "btc", label: "Bitcoin provider", tone: "amber" },
    { id: "rgbpp", label: "RGB++ service", tone: "cyan" },
    { id: "ckb", label: "CKB node", tone: "mint" },
  ],
  nodes: [
    { id: "start", lane: "page", row: 0, kind: "terminal", label: "A mint's Bitcoin txid", tone: "violet" },
    { id: "btctx", lane: "btc", row: 0, kind: "process", label: "The Bitcoin transaction", detail: "its outputs", tone: "amber" },
    { id: "which", lane: "rgbpp", row: 0, kind: "process", label: "Which CKB transaction?", detail: "only used to find it", tone: "cyan" },
    { id: "ckbtx", lane: "ckb", row: 0, kind: "process", label: "The CKB transaction", detail: "and the cells it consumed", tone: "mint" },
    { id: "recompute", lane: "page", row: 1, kind: "process", label: "Recompute", detail: "from the raw transactions", tone: "violet" },
    { id: "commit", lane: "page", row: 2, kind: "decision", label: "Commitment matches?" },
    { id: "armed", lane: "page", row: 3, kind: "decision", label: "Armed miner cell spent?" },
    { id: "work", lane: "page", row: 4, kind: "decision", label: `Hash ≥ ${MIN_CLZ} zero bits?` },
    { id: "amount", lane: "page", row: 5, kind: "decision", label: "Exactly the reward?" },
    { id: "bad", lane: "btc", row: 5, kind: "terminal", label: "Invalid: check named", tone: "rose" },
    { id: "ok", lane: "page", row: 6, kind: "terminal", label: "Valid mint", tone: "mint" },
  ],
  edges: [
    { from: "start", to: "btctx" },
    { from: "btctx", to: "which" },
    { from: "which", to: "ckbtx" },
    { from: "ckbtx", to: "recompute", fromSide: "bottom", toSide: "right" },
    { from: "recompute", to: "commit" },
    { from: "commit", to: "armed", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "armed", to: "work", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "work", to: "amount", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "amount", to: "ok", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "commit", to: "bad", kind: "no", fromSide: "right", toSide: "top" },
    { from: "armed", to: "bad", kind: "no", fromSide: "right", toSide: "top" },
    { from: "work", to: "bad", kind: "no", fromSide: "right", toSide: "top" },
    { from: "amount", to: "bad", kind: "no", fromSide: "right", toSide: "left" },
  ],
};

export default function VerificationPage() {
  return (
    <>
      <section>
        <h2>Check a mint yourself</h2>
        <p>
          The <a href="#/proof">Proof page</a> takes a mint's Bitcoin transaction id and re-checks every rule the mint
          script enforced, using raw data from the two chains rather than anything btc.fun's index says. It shows each check
          with the numbers behind it, so you can see <em>why</em> a mint is valid, not just that it is. It is linked from
          the footer of every page as <em>Verify a mint</em>; what it relies on is folded under the verdict.
        </p>
        <Diagram spec={VERIFY} />
      </section>

      <section>
        <h2>What it establishes, and what it assumes</h2>
        <ul>
          <li>
            <strong>Established:</strong> the Bitcoin and CKB transactions are consistent with each other and with the
            standard — the commitment binds them, the ticket was paid for and armed, the work is real and the amount is
            exactly the reward. CKB itself already ran the mint script; this shows the same result independently.
          </li>
          <li>
            <strong>Assumed:</strong> that the data the providers returned is what is on the canonical chains. Fetching
            from a public endpoint is not proof that a chain is the right one. Someone who trusts neither provider can run
            the same checks against their own Bitcoin and CKB nodes.
          </li>
          <li>
            <strong>Not shown yet:</strong> a confirmation policy and what happens if Bitcoin reorganises after CKB accepted
            a transaction. Those are open questions in the protocol, not settled ones.
          </li>
        </ul>
        <Technical>
          <ul>
            <li>
              <code>verifyMint</code> (<code>lib/rgbpp/verify.ts</code>) takes data, not a network: the Bitcoin outputs, the
              CKB transaction and its consumed cells. Fetching is the caller's business, so the checks are unit-tested and
              can be fed from any node.
            </li>
            <li>
              Commitment: the CKB transaction's RGB++-locked outputs have the mint's txid put back to the placeholder,
              the commitment is recomputed, and it must equal the first <code>OP_RETURN</code>.
            </li>
            <li>
              Work: the challenge is <code>sha256(ticket txid ‖ vout)</code> of the output the consumed miner cell was sealed
              to; the hash is <code>sha256d(challenge ‖ nonce)</code> with the nonce the new miner cell carries.
            </li>
            <li>
              Amount: the sum of this launch's xUDT in outputs minus inputs must equal the reward for that many bits at the
              anchor stored in the consumed cell, with the opening height read from the mint script's args.
            </li>
            <li>
              The RGB++ service is used only to find the CKB transaction hash; everything checked comes from the chains.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
