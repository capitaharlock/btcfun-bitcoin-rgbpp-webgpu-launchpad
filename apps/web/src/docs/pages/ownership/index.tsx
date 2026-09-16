import { Diagram } from "../../../components/diagram/Diagram";
import type { DiagramSpec } from "../../../components/diagram/model";
import { group } from "../../../lib/format";
import { SEAL_SATS } from "../../../lib/rgbpp/operations";
import { DocLink, Technical } from "../../parts";

const OWNERSHIP: DiagramSpec = {
  title: "A token cell is sealed to a Bitcoin output",
  description:
    "Your tokens are a cell on CKB whose lock names one Bitcoin output: a transaction id and an output index. The only way to " +
    "move the cell is to spend that output in a Bitcoin transaction whose OP_RETURN commits to the CKB transaction that " +
    "consumes the cell. The RGB++ lock on CKB accepts that CKB transaction only with an SPV proof of the Bitcoin transaction " +
    "and a matching commitment; otherwise the cell cannot move.",
  laneWidth: 300,
  lanes: [
    { id: "btc", label: "Bitcoin", tone: "amber" },
    { id: "ckb", label: "CKB", tone: "mint" },
  ],
  nodes: [
    { id: "utxo", lane: "btc", row: 0, kind: "process", label: "Your Bitcoin output", detail: `txid : 2 · ${group(SEAL_SATS)} sats · your key`, tone: "amber" },
    {
      id: "cell",
      lane: "ckb",
      row: 0,
      kind: "cell",
      label: "Token cell (xUDT)",
      tone: "mint",
      fields: [
        { key: "lock", value: "RGB++ · args = 2 ‖ txid" },
        { key: "type", value: "xUDT · owner = mint script" },
        { key: "data", value: "amount, 16 bytes" },
      ],
    },
    { id: "spend", lane: "btc", row: 1, kind: "process", label: "You spend it", detail: "only your key can sign", tone: "violet" },
    { id: "commit", lane: "btc", row: 2, kind: "process", label: "OP_RETURN commits", detail: "to the CKB transaction that moves the cell", tone: "amber" },
    { id: "check", lane: "ckb", row: 3, kind: "decision", label: "Proof and commitment match?" },
    { id: "moved", lane: "ckb", row: 4, kind: "terminal", label: "Cell moves to new outputs", tone: "mint" },
    { id: "stuck", lane: "btc", row: 3, kind: "terminal", label: "Nothing moves", tone: "rose" },
  ],
  edges: [
    { from: "cell", to: "utxo", kind: "seal" },
    { from: "utxo", to: "spend" },
    { from: "spend", to: "commit" },
    { from: "commit", to: "check", label: "RGB++ queue", fromSide: "right", toSide: "top" },
    { from: "check", to: "moved", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "check", to: "stuck", kind: "no", fromSide: "left", toSide: "right" },
  ],
};

export default function OwnershipPage() {
  return (
    <>
      <section>
        <h2>Your tokens sit on a Bitcoin output</h2>
        <p>
          A balance of a btc.fun token is a record on CKB — a <em>cell</em> — that names one Bitcoin output as its
          owner. We say the cell is <strong>sealed</strong> to that output. Whoever can spend the output controls the
          tokens; in this app that is your wallet's key, and nobody else's.
        </p>
        <p>
          There is no account and no balance kept by btc.fun. Your holdings page reads the cells on CKB that are sealed to
          your wallet's outputs. If this site disappeared, the cells and the outputs would still be there.
        </p>
        <Diagram spec={OWNERSHIP} />
      </section>

      <section>
        <h2>Spending the output is the only way to move the tokens</h2>
        <p>
          To move a cell, you spend its Bitcoin output in a transaction that also carries, in an <code>OP_RETURN</code>{" "}
          output, a fingerprint of the CKB transaction that consumes the cell and creates its successors. CKB then accepts
          that CKB transaction only if it is shown a proof that this Bitcoin transaction really is in a Bitcoin block, and
          the fingerprint matches. The new cells are sealed to outputs of the same Bitcoin transaction — so ownership moves
          with the Bitcoin payment, in one step.
        </p>
        <p>
          The flip side: a Bitcoin output that carries tokens must not be spent by a wallet that does not know about them.
          The Bitcoin transaction would succeed, but no CKB transaction would match it, and the tokens would be stuck for
          good. The app never spends an output the RGB++ service reports as carrying cells, except in an operation that
          moves them.
        </p>
      </section>

      <section>
        <h2>Why nobody else can mint this token</h2>
        <p>
          Anyone can create a token on CKB. Nobody can create <em>this</em> one outside the mint rule: the token's
          identity (its type script) names the launch's mint script as its only owner, so new units appear only in a
          transaction the mint script has approved — a paid ticket, enough work and the exact reward. See{" "}
          <DocLink to="mint">the mint circuit</DocLink>.
        </p>
        <Technical>
          <ul>
            <li>
              The RGB++ lock's args are <code>out_index u32 LE ‖ btc_txid</code>, 36 bytes, with the txid in Bitcoin's
              internal byte order — the reverse of how explorers print it (<code>lib/rgbpp/seal.ts</code>).
            </li>
            <li>
              A cell created by the transaction still being built carries an all-zero txid, since the txid cannot exist
              before the transaction does; the commitment is computed over that placeholder and the queue writes the real
              txid in when it submits.
            </li>
            <li>
              The commitment is <code>sha256d("RGB++" ‖ version ‖ counts ‖ inputs ‖ outputs with their data)</code> of the
              CKB transaction, 32 bytes after <code>OP_RETURN OP_PUSHBYTES_32</code> (<code>lib/rgbpp/commitment.ts</code>
              ). It is pinned by test to the RGB++ SDK and lock.
            </li>
            <li>
              The RGB++ lock checks the Bitcoin transaction through the Bitcoin SPV client that lives on CKB. The mint
              script reads the same, already-verified proof for the ticket payment and its confirming height.
            </li>
            <li>
              The token is an xUDT with owner mode by input type (<code>flags 0x80000000</code>), the owner being the hash
              of the mint script with the launch's terms as args. So the xUDT type hash commits to the opening height, the
              promoter's address and the metadata hash: change any of them and it is a different token.
            </li>
            <li>
              The amount is a 16-byte little-endian integer in atoms, 8 decimals. Each cell also holds CKB capacity for its
              own storage.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
