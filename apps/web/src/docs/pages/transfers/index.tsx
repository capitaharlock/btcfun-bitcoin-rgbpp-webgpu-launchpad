import { Diagram } from "@/features/diagram/Diagram";
import type { DiagramSpec } from "@/features/diagram/model";
import { group } from "@/ui/format";
import { SEAL_SATS } from "@/domain/rgbpp";
import { DocLink, Technical } from "@/docs/parts";

const seal = group(SEAL_SATS);

const FLOW: DiagramSpec = {
  title: "A transfer, step by step",
  description:
    `You choose an amount and a recipient's Bitcoin address. Your wallet signs one Bitcoin transaction that spends the outputs your ` +
    `tokens are sealed to, pays ${seal} sats to the recipient's address and commits to a CKB transaction. After it confirms, the ` +
    `RGB++ queue proves it to CKB; the RGB++ lock checks the proof and the xUDT checks that no tokens were created. Then the ` +
    `recipient's tokens are sealed to the output that paid them.`,
  lanes: [
    { id: "you", label: "You · sender", tone: "violet" },
    { id: "btc", label: "Bitcoin", tone: "amber" },
    { id: "queue", label: "RGB++ queue", tone: "cyan" },
    { id: "ckb", label: "CKB", tone: "mint" },
  ],
  nodes: [
    { id: "start", lane: "you", row: 0, kind: "terminal", label: "Send an amount", tone: "violet" },
    { id: "sign", lane: "you", row: 1, kind: "process", label: "Sign one transaction", detail: "spends your token outputs", tone: "violet" },
    { id: "tx", lane: "btc", row: 1, kind: "process", label: "Transfer transaction", detail: `${seal} sats to the recipient`, tone: "amber" },
    { id: "confirm", lane: "btc", row: 2, kind: "process", label: "Confirmed in a block", tone: "amber" },
    { id: "prove", lane: "queue", row: 2, kind: "process", label: "Proves it to CKB", detail: "SPV proof, then submits", tone: "cyan" },
    { id: "lock", lane: "ckb", row: 3, kind: "decision", label: "Proof and commitment valid?" },
    { id: "sum", lane: "ckb", row: 4, kind: "decision", label: "No tokens created?" },
    { id: "rejected", lane: "queue", row: 4, kind: "terminal", label: "BTC spent; CKB move rejected", tone: "rose" },
    { id: "done", lane: "ckb", row: 5, kind: "terminal", label: "Recipient holds the tokens", tone: "mint" },
  ],
  edges: [
    { from: "start", to: "sign" },
    { from: "sign", to: "tx" },
    { from: "tx", to: "confirm" },
    { from: "confirm", to: "prove" },
    { from: "prove", to: "lock", fromSide: "right", toSide: "top" },
    { from: "lock", to: "sum", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "lock", to: "rejected", kind: "no", fromSide: "left", toSide: "top" },
    { from: "sum", to: "rejected", kind: "no", fromSide: "left", toSide: "right" },
    { from: "sum", to: "done", kind: "yes", fromSide: "bottom", toSide: "top" },
  ],
};

const ANATOMY: DiagramSpec = {
  title: "Inside a transfer",
  description:
    `Bitcoin inputs: the outputs your token cells are sealed to, and your coins. Outputs in order: 0, the OP_RETURN commitment; 1, ` +
    `${seal} sats to the recipient's address, which their tokens are sealed to; 2, a ${seal}-sat seal for your change, when you keep ` +
    `some; a paymaster fee when the new cells need CKB capacity your cells lack; then your change in bitcoin. On CKB your token ` +
    `cells are consumed and a cell for the recipient, plus one for your change, are created.`,
  laneWidth: 680,
  lanes: [{ id: "tx" }],
  nodes: [
    {
      id: "btc",
      lane: "tx",
      row: 0,
      kind: "transaction",
      label: "Bitcoin · transfer transaction",
      tone: "amber",
      inputs: [
        { id: "tokens", label: "Your token outputs", value: seal, detail: "one or more, each carrying a token cell", tone: "violet" },
        { id: "coins", label: "Your coins", detail: "pay the recipient's output and the fee", tone: "slate" },
      ],
      outputs: [
        { id: "commit", label: "0 · OP_RETURN", value: "32 B", detail: "commitment to the CKB transaction", tone: "cyan" },
        { id: "to", label: "1 · recipient's address", value: seal, detail: "their tokens are sealed here", tone: "violet" },
        { id: "back", label: "2 · seal: your change", value: seal, detail: "only if you keep some", tone: "violet" },
        { id: "paymaster", label: "paymaster fee", detail: "only when CKB capacity is short", tone: "amber" },
        { id: "change", label: "last · your change", value: "rest", tone: "slate" },
      ],
    },
    {
      id: "ckb",
      lane: "tx",
      row: 1,
      kind: "transaction",
      label: "CKB · the transaction it commits to",
      tone: "mint",
      inputs: [{ id: "held", label: "Your token cells", detail: "your whole balance on those outputs", tone: "mint" }],
      outputs: [
        { id: "theirs", label: "Token cell · the amount sent", detail: "sealed to output 1", tone: "mint" },
        { id: "mine", label: "Token cell · your change", detail: "sealed to output 2", tone: "mint" },
      ],
    },
  ],
  edges: [
    { from: "btc.commit", to: "ckb", kind: "commit", toSide: "right" },
    { from: "ckb.held", to: "btc.tokens", kind: "seal" },
    { from: "ckb.theirs", to: "btc.to", kind: "seal" },
    { from: "ckb.mine", to: "btc.back", kind: "seal" },
  ],
};

export default function TransfersPage() {
  return (
    <>
      <section>
        <h2>One Bitcoin transaction</h2>
        <p>
          Sending tokens is a Bitcoin transaction you sign. It spends the outputs your tokens are sealed to and pays a
          small output ({seal} sats) to the recipient's Bitcoin address; the recipient's tokens are sealed to that output,
          so they own them with the same key that owns the bitcoin. What you keep is sealed to a new output of yours in the
          same transaction.
        </p>
        <p>
          The recipient can receive while offline, using a Bitcoin address, without holding CKB. They need a wallet that
          understands RGB++ to find and later spend the tokens. Delivery is complete after the Bitcoin transaction
          confirms and CKB accepts the matching transaction — see <DocLink to="mint">when tokens are delivered</DocLink>.
        </p>
        <Diagram spec={FLOW} />
      </section>

      <section>
        <h2>What authorises a transfer</h2>
        <p>
          Only your signature on the Bitcoin transaction. No server approves it and no one else can make it: the RGB++ lock
          on CKB moves your cell only for the Bitcoin transaction that spent its output and committed to this exact move.
          The token's own script, the xUDT, makes sure the amounts out never exceed the amounts in.
        </p>
        <Diagram spec={ANATOMY} />
        <Technical>
          <ul>
            <li>
              <code>planTransfer</code> in <code>domain/rgbpp/plans/transfer.ts</code>: the recipient's cell is sealed to output 1
              (which pays their address), the sender's change to output 2. The commitment is at output 0 and bitcoin change
              comes last. Its Bitcoin script is encoded by the same <code>commitmentScript</code> function used for mint and
              purchase transactions.
            </li>
            <li>
              A new token cell needs CKB capacity. When the consumed cells do not have enough, the RGB++ paymaster provides
              it for a fee in the same Bitcoin transaction; when they do, the recipient's cell absorbs the spare capacity,
              less the CKB fee. A transfer pays the network like any other operation; only a ticket pays anyone else.
            </li>
            <li>
              Funding coins are only confirmed UTXOs the RGB++ service reports as free of cells, and never a {seal}-sat
              output of an operation still landing, which the service cannot yet tell from a plain coin: spending a UTXO
              that carries cells, without moving them, would strand them.
            </li>
            <li>
              The mint script is not involved: without a miner cell in the transaction, the xUDT's owner mode is off, so the
              total of this token cannot grow. Token cells and miner cells are sealed to different outputs, so a transfer
              never touches a ticket being mined, nor the admission a miner's first arming carries.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
