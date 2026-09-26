import { Diagram } from "../../../components/diagram/Diagram";
import type { DiagramSpec } from "../../../components/diagram/model";
import { group } from "../../../lib/format";
import { SEAL_SATS } from "../../../lib/rgbpp/operations";
import { DocLink, Technical } from "../../parts";

const OWNERSHIP: DiagramSpec = {
  title: "A token cell is sealed to a Bitcoin output",
  description:
    "The token amount lives in a CKB cell sealed to a Bitcoin output. A Bitcoin transaction spends the output and commits " +
    "to a corresponding CKB transaction. After Bitcoin confirmation, the RGB++ queue supplies a proof and submits the " +
    "CKB transaction. If that transaction cannot be accepted, the Bitcoin output has still been spent and the old token " +
    "cell remains on CKB; recovery is not guaranteed.",
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
    { id: "spend", lane: "btc", row: 1, kind: "process", label: "Your wallet signs the spend", detail: "Bitcoin validates the signature", tone: "violet" },
    { id: "commit", lane: "btc", row: 2, kind: "process", label: "Bitcoin confirms the spend", detail: "OP_RETURN commits to the CKB move", tone: "amber" },
    { id: "check", lane: "ckb", row: 3, kind: "decision", label: "Proof and scripts valid?" },
    { id: "moved", lane: "ckb", row: 4, kind: "terminal", label: "CKB confirms new token cells", tone: "mint" },
    { id: "stuck", lane: "btc", row: 4, kind: "terminal", label: "BTC spent; token cell stuck", tone: "rose" },
  ],
  edges: [
    { from: "cell", to: "utxo", kind: "seal" },
    { from: "utxo", to: "spend" },
    { from: "spend", to: "commit" },
    { from: "commit", to: "check", label: "queue submits proof", fromSide: "right", toSide: "top" },
    { from: "check", to: "moved", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "check", to: "stuck", kind: "no", fromSide: "left", toSide: "top" },
  ],
};

export default function OwnershipPage() {
  return (
    <>
      <section>
        <h2>Your token balance lives on CKB and is bound to Bitcoin</h2>
        <p>
          A btc.fun token amount is stored in a CKB <em>cell</em>, not in Bitcoin's native balance. Its RGB++ lock names a
          Bitcoin output; we say the cell is <strong>sealed</strong> to that output. The key able to spend that output
          authorizes the normal RGB++ transfer path. In this app, that key belongs to your wallet.
        </p>
        <p>
          There is no account and no balance kept by btc.fun. Your holdings page reads the cells on CKB that are sealed to
          your wallet's outputs. If this site disappeared, the cells and the outputs would still be there.
        </p>
        <Diagram spec={OWNERSHIP} />
      </section>

      <section>
        <h2>How a Bitcoin-to-Bitcoin transfer works</h2>
        <p>
          For a Bitcoin-to-Bitcoin RGB++ transfer, your wallet signs a Bitcoin transaction that spends the sealed output.
          An <code>OP_RETURN</code> in that transaction commits to a proposed CKB transaction. Once Bitcoin confirms it,
          the RGB++ queue supplies the Bitcoin proof and submits the CKB transaction. The RGB++ lock checks the proof and
          commitment; the xUDT script checks the token amounts. Only after CKB confirms that transaction are the successor
          cells live, sealed to outputs of the Bitcoin transaction. These are two chain confirmations, not an atomic
          one-step transfer.
        </p>
        <p>
          A wallet unaware of RGB++ can spend the Bitcoin output without a usable CKB transition. Bitcoin can confirm
          that spend while the old token cell remains on CKB, potentially stranded. Checking a service's asset listing
          helps the app avoid this, but that listing is not itself a proof that every relevant cell was found. Keep the
          virtual CKB transaction and verify the resulting CKB state before treating a transfer as complete.
        </p>
        <p>
          The earliest you can regard the recipient's tokens as settled depends on Bitcoin confirmation, proof delivery
          and CKB acceptance. A faster queue or CKB block cannot remove the Bitcoin confirmation step. An unconfirmed
          Bitcoin transaction can be shown as pending, but it is not final token ownership.
        </p>
      </section>

      <section>
        <h2>Why nobody else can mint this token</h2>
        <p>
          Anyone can create an xUDT on CKB. This token's xUDT type script names the launch's mint script as its owner.
          Under xUDT owner mode, increasing its supply requires a transaction that runs that mint script. The intended
          rule checks a paid ticket, sufficient work and the exact reward. This claim depends on the deployed script and
          its dependencies being correct; the complete testnet path and an independent review are still pending. See{" "}
          <DocLink to="mint">the mint circuit</DocLink>.
        </p>
        <Technical>
          <ul>
            <li>
              The RGB++ lock's args are <code>out_index u32 LE ‖ btc_txid</code>, 36 bytes, with the txid in Bitcoin's
              internal byte order — the reverse of how explorers print it (<code>lib/rgbpp/seal.ts</code>, byte order in <code>lib/bitcoin/txid.ts</code>).
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
            <li>
              Sources: <a href="https://github.com/RGBPlusPlus/rgbpp-sdk">RGB++ SDK and transfer workflow</a> and{" "}
              <a href="https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md">CKB xUDT specification</a>.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
