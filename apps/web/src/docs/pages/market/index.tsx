import { Diagram } from "../../../components/diagram/Diagram";
import type { DiagramSpec } from "../../../components/diagram/model";
import { DUST_SATS } from "../../../lib/bitcoin/network";
import { group } from "../../../lib/format";
import { SEAL_SATS } from "../../../lib/rgbpp/operations";
import { BUYER_SEAL_VOUT } from "../../../lib/rgbpp/sale";
import { DocLink, Technical } from "../../parts";

const seal = group(SEAL_SATS);

const ASK: DiagramSpec = {
  title: "An ask: the seller signs once, the buyer finishes alone",
  description:
    "The seller puts the tokens for sale in their own Bitcoin output, then signs just two things with SIGHASH_SINGLE | " +
    "ANYONECANPAY: that output as input 0, and the price paid to themselves as output 0. The index publishes this signed " +
    "listing. A buyer checks it, adds the commitment, the output their tokens will be sealed to, their funding and change, " +
    "signs their own inputs and broadcasts. After confirmation the RGB++ queue proves it to CKB and the tokens move to the " +
    "buyer. Payment and delivery are one Bitcoin transaction.",
  laneWidth: 206,
  lanes: [
    { id: "seller", label: "Seller", tone: "violet" },
    { id: "index", label: "Index", tone: "slate" },
    { id: "buyer", label: "Buyer", tone: "violet" },
    { id: "chain", label: "Bitcoin · RGB++ · CKB", tone: "amber" },
  ],
  nodes: [
    { id: "start", lane: "seller", row: 0, kind: "terminal", label: "Sell N tokens for P sats", tone: "violet" },
    { id: "isolate", lane: "seller", row: 1, kind: "process", label: "Isolate the N tokens", detail: "in an output of their own", tone: "violet" },
    { id: "sign", lane: "seller", row: 2, kind: "process", label: "Sign one pair", detail: "input 0 and output 0, SINGLE | ANYONECANPAY", tone: "sun" },
    { id: "list", lane: "index", row: 2, kind: "process", label: "Listing published", detail: "signed data; no funds", tone: "slate" },
    { id: "check", lane: "buyer", row: 3, kind: "process", label: "Check the listing", detail: "signature, price, live cell", tone: "violet" },
    { id: "complete", lane: "buyer", row: 4, kind: "process", label: "Complete the transaction", detail: "commitment, own seal, funding, change", tone: "violet" },
    { id: "broadcast", lane: "buyer", row: 5, kind: "process", label: "Sign own inputs, broadcast", tone: "violet" },
    { id: "tx", lane: "chain", row: 5, kind: "process", label: "One transaction", detail: "price and tokens move together", tone: "amber" },
    { id: "queue", lane: "chain", row: 6, kind: "process", label: "Queue proves it to CKB", tone: "cyan" },
    { id: "done", lane: "chain", row: 7, kind: "terminal", label: "Seller paid, buyer holds", tone: "mint" },
    { id: "cancel", lane: "seller", row: 4, kind: "note", label: "To cancel: spend the listed output. The listing then cannot complete." },
  ],
  edges: [
    { from: "start", to: "isolate" },
    { from: "isolate", to: "sign" },
    { from: "sign", to: "list" },
    { from: "list", to: "check", fromSide: "right", toSide: "top" },
    { from: "check", to: "complete" },
    { from: "complete", to: "broadcast" },
    { from: "broadcast", to: "tx" },
    { from: "tx", to: "queue" },
    { from: "queue", to: "done" },
  ],
};

const PURCHASE: DiagramSpec = {
  title: "Inside a purchase",
  description:
    `Input 0 is the seller's token output, signed by the seller; output 0 is the seller's price. The seller's signature covers ` +
    `only that pair. The buyer adds output 1, the OP_RETURN commitment; output ${BUYER_SEAL_VOUT}, a ${seal}-sat seal their tokens ` +
    `will be bound to; their own coins as further inputs; and change. On CKB the listed cell is consumed and recreated, with ` +
    `the same amount, sealed to output ${BUYER_SEAL_VOUT}.`,
  laneWidth: 680,
  lanes: [{ id: "tx" }],
  nodes: [
    {
      id: "btc",
      lane: "tx",
      row: 0,
      kind: "transaction",
      label: "Bitcoin · purchase transaction",
      tone: "amber",
      inputs: [
        { id: "listed", label: "0 · seller's token output", value: seal, detail: "signed by the seller, with output 0 only", tone: "sun" },
        { id: "coins", label: "buyer's coins", detail: "signed by the buyer", tone: "slate" },
      ],
      outputs: [
        { id: "price", label: "0 · the seller's price", value: "P", detail: "the output the seller signed", tone: "sun" },
        { id: "commit", label: "1 · OP_RETURN", value: "32 B", detail: "added by the buyer", tone: "cyan" },
        { id: "seal", label: `${BUYER_SEAL_VOUT} · seal: buyer's tokens`, value: seal, detail: "added by the buyer", tone: "violet" },
        { id: "change", label: "3 · buyer's change", value: "rest", tone: "slate" },
      ],
    },
    {
      id: "ckb",
      lane: "tx",
      row: 1,
      kind: "transaction",
      label: "CKB · the transaction it commits to",
      tone: "mint",
      inputs: [{ id: "cell", label: "Token cell · N tokens", detail: "the listed cell", tone: "mint" }],
      outputs: [{ id: "bought", label: "Token cell · N tokens", detail: `sealed to output ${BUYER_SEAL_VOUT}`, tone: "mint" }],
    },
  ],
  edges: [
    { from: "btc.commit", to: "ckb", kind: "commit", toSide: "right" },
    { from: "ckb.cell", to: "btc.listed", kind: "seal" },
    { from: "ckb.bought", to: "btc.seal", kind: "seal" },
  ],
};

const BID: DiagramSpec = {
  title: "A bid: a signed intention, met by an ordinary listing",
  description:
    "A bidder signs a bid — N tokens for P sats — which locks no funds, and the index shows it. A holder who accepts signs an " +
    "ordinary listing for exactly those terms, labelled with the bid. The bidder completes that listing like any buyer, in one " +
    "Bitcoin transaction. Until that last step either side can walk away, and anyone may buy the listing.",
  laneWidth: 206,
  lanes: [
    { id: "bidder", label: "Bidder", tone: "violet" },
    { id: "index", label: "Index", tone: "slate" },
    { id: "holder", label: "Holder", tone: "violet" },
    { id: "chain", label: "Bitcoin · RGB++ · CKB", tone: "amber" },
  ],
  nodes: [
    { id: "start", lane: "bidder", row: 0, kind: "terminal", label: "Want N tokens for P sats", tone: "violet" },
    { id: "sign", lane: "bidder", row: 1, kind: "process", label: "Sign the bid", detail: "nothing is locked", tone: "violet" },
    { id: "shown", lane: "index", row: 1, kind: "process", label: "Bid published", detail: "signed data", tone: "slate" },
    { id: "accept", lane: "holder", row: 2, kind: "decision", label: "Accept?" },
    { id: "ignore", lane: "chain", row: 2, kind: "terminal", label: "Nothing happens", tone: "slate" },
    { id: "listing", lane: "holder", row: 3, kind: "process", label: "List exactly N for P", detail: "an ordinary signed ask", tone: "sun" },
    { id: "listed", lane: "index", row: 4, kind: "process", label: "Listing published", detail: "labelled with the bid", tone: "slate" },
    { id: "complete", lane: "bidder", row: 5, kind: "process", label: "Complete it like any buyer", detail: "and broadcast", tone: "violet" },
    { id: "tx", lane: "chain", row: 5, kind: "process", label: "One transaction", detail: "price and tokens together", tone: "amber" },
    { id: "done", lane: "chain", row: 6, kind: "terminal", label: "Settled", tone: "mint" },
  ],
  edges: [
    { from: "start", to: "sign" },
    { from: "sign", to: "shown" },
    { from: "shown", to: "accept", fromSide: "right", toSide: "top" },
    { from: "accept", to: "ignore", kind: "no", fromSide: "right", toSide: "left" },
    { from: "accept", to: "listing", kind: "yes", fromSide: "bottom", toSide: "top" },
    { from: "listing", to: "listed", fromSide: "left", toSide: "top" },
    { from: "listed", to: "complete", fromSide: "left", toSide: "top" },
    { from: "complete", to: "tx" },
    { from: "tx", to: "done" },
  ],
};

export default function MarketPage() {
  return (
    <>
      <section>
        <h2>An order book between people</h2>
        <p>
          The market is a <strong>peer-to-peer order book</strong>, over launches btc.fun has admitted. Selling never touches a ticket being mined: token
          cells and miner cells are sealed to different outputs. There is no liquidity pool, no automated market maker
          and no market maker of ours: every trade is between one seller and one buyer, at a price one of them chose.{" "}
          <strong>Nothing is escrowed</strong> — no one, including btc.fun, ever holds the tokens or the bitcoin in between.
        </p>
        <ul>
          <li>
            An <strong>ask</strong> is a sale the seller has already signed. Any buyer can complete it on their own, while
            the seller is offline.
          </li>
          <li>
            A <strong>bid</strong> is a signed statement of what someone would pay. It locks nothing; it becomes a trade
            only when a holder answers it with an ask and the bidder completes that ask.
          </li>
        </ul>
        <p>
          Every order is all-or-nothing, and every price in the book is one a person signed — nobody can move the price by
          trading against a formula. Liquidity can be thin, and the book says so rather than filling the gap with platform
          money. A promoter may take their token to an external pool elsewhere; that is their choice and their pool, and
          btc.fun does not create, fund or operate one.
        </p>
      </section>

      <section>
        <h2>Asks</h2>
        <p>
          To sell, the seller first puts exactly the tokens for sale on a Bitcoin output of their own (a listing sells in
          full; partial sales are several listings). Then they sign a half-finished Bitcoin transaction: “this output of
          mine goes in, and this price comes out to me”. The signature type used —{" "}
          <code>SIGHASH_SINGLE | ANYONECANPAY</code> — covers only that one input and that one output, so anyone may add
          their own inputs and outputs later without breaking it.
        </p>
        <p>
          A buyer adds the rest: the commitment that moves the tokens, the output they will be sealed to, the bitcoin that
          pays the price, and their change. They sign their part and broadcast. The price and the tokens move in the same
          Bitcoin transaction, so neither can happen without the other: the seller's signature is valid only if the price
          output pays them, and the tokens can only follow the transaction that spends their output.
        </p>
        <Diagram spec={ASK} />
        <Diagram spec={PURCHASE} />
      </section>

      <section>
        <h2>Bids</h2>
        <p>
          A resting buy order that fills by itself would need someone to hold the buyer's money, and nobody does here. A
          bid is therefore a <strong>signed intention</strong>: “I would pay P sats for N tokens”. A holder who agrees
          accepts it by signing an ordinary ask for exactly those terms, labelled with the bid; the bidder then completes it
          as any buyer would. Until that final step either side can walk away — and because the ask is ordinary, anyone
          else may buy it first.
        </p>
        <Diagram spec={BID} />
        <Technical>
          <ul>
            <li>
              A listing is a PSBT with one input (the seal of the token cell for sale) and one output (the price to the
              seller), the input signed with <code>SIGHASH_SINGLE | ANYONECANPAY</code> and not finalised: it pays out more
              than it takes in until a buyer completes it (<code>lib/rgbpp/sale.ts</code>).
            </li>
            <li>
              The buyer's transaction: the seller's input at 0, then the buyer's funding; outputs are the price at 0, the
              RGB++ commitment at 1, the buyer's {seal}-sat seal at {BUYER_SEAL_VOUT}, then change. On CKB, the listed cell
              is consumed and recreated with the same amount, sealed to output {BUYER_SEAL_VOUT}.
            </li>
            <li>
              Before paying, the buyer checks that the PSBT parses, spends the listed seal, carries the seller's signature
              with the right sighash, pays the seller's address and matches the stated price, and that the cell exists with
              the stated amount. A listing is only a claim until the chain confirms it.
            </li>
            <li>
              A price is at least {group(DUST_SATS)} sats, the dust limit, because the price is its own Bitcoin output.
              Unlike a ticket, a sale pays no platform share: the market adds nothing to what the two sides agree.
            </li>
            <li>
              Cancelling a listing is spending the listed output: the signature then refers to an output that no longer
              exists. A bid is withdrawn by a signed <code>cancel</code> event from its author; only the author's
              withdrawal counts.
            </li>
            <li>
              A sale counts as a trade only when its Bitcoin transaction spends the listed output and pays the seller the
              listed price; a bid is filled only when that sale delivered to the bidder's address. A report of a sale is a
              pointer to where to look, never the evidence.
            </li>
            <li>
              The index stores listings and bids as public signed data. It can omit an entry but cannot forge or alter one,
              and it never touches funds. See <DocLink to="ownership">where a token lives</DocLink> for why the tokens can
              only move with that output.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
