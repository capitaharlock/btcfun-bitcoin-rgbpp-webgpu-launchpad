import { Diagram } from "../../../components/diagram/Diagram";
import type { DiagramSpec } from "../../../components/diagram/model";
import { group } from "../../../lib/format";
import { TICKET_SATS } from "../../../lib/standard";
import { KV } from "../../../ui/primitives";
import { DocLink, Technical } from "../../parts";

const MAP: DiagramSpec = {
  title: "Who does what",
  description:
    "Your browser holds your keys, mines, and builds every operation as a pair: a CKB transaction and the Bitcoin transaction " +
    "that commits to it. You sign and broadcast the Bitcoin side on testnet3. Once it confirms, the RGB++ queue attaches a proof " +
    "of it and submits the CKB side to CKB testnet, where the RGB++ lock checks the proof and the mint script checks the rules. " +
    "The index only relays signed public data: launches, listings and activity.",
  laneWidth: 184,
  lanes: [
    { id: "browser", label: "Your browser", tone: "violet" },
    { id: "index", label: "Index", tone: "slate" },
    { id: "btc", label: "Bitcoin testnet3", tone: "amber" },
    { id: "queue", label: "RGB++ queue", tone: "cyan" },
    { id: "ckb", label: "CKB testnet", tone: "mint" },
  ],
  nodes: [
    { id: "wallet", lane: "browser", row: 0, kind: "process", label: "Wallet", detail: "keys from a passkey", tone: "violet" },
    { id: "index", lane: "index", row: 0, kind: "process", label: "Signed public data", detail: "launches, listings, activity", tone: "slate" },
    { id: "miner", lane: "browser", row: 1, kind: "process", label: "Miner", detail: "WebGPU, or CPU workers", tone: "violet" },
    { id: "build", lane: "browser", row: 2, kind: "process", label: "Builds each operation", detail: "a CKB transaction and the Bitcoin one committing to it", tone: "violet" },
    { id: "btc", lane: "btc", row: 2, kind: "process", label: "Bitcoin transaction", detail: "payments, and the outputs tokens live on", tone: "amber" },
    { id: "queue", lane: "queue", row: 3, kind: "process", label: "Proves and submits", detail: "SPV proof of the Bitcoin transaction", tone: "cyan" },
    { id: "ckb", lane: "ckb", row: 4, kind: "process", label: "Cells change", detail: "RGB++ lock, xUDT, mint script", tone: "mint" },
  ],
  edges: [
    { from: "wallet", to: "index" },
    { from: "wallet", to: "miner" },
    { from: "miner", to: "build" },
    { from: "build", to: "btc", label: "sign" },
    { from: "btc", to: "queue", fromSide: "right", toSide: "top" },
    { from: "queue", to: "ckb", fromSide: "right", toSide: "top" },
  ],
};

export default function OverviewPage() {
  return (
    <>
      <section>
        <h2>In one paragraph</h2>
        <p>
          btc.fun is a launchpad for community tokens that all follow the same rules. You buy a <strong>ticket</strong> on
          Bitcoin for {group(TICKET_SATS)} sats, your browser <strong>mines</strong> against that ticket, and you{" "}
          <strong>mint</strong> what your best result is worth into a Bitcoin output you control. The token itself is
          recorded on a second chain, CKB, and bound to that Bitcoin output, so whoever can spend the output owns the
          tokens. A script on CKB — not this website — decides whether a mint is valid, and anyone can check any mint from
          the two chains.
        </p>
        <p>
          Everything here runs on <strong>test networks</strong>: the coins and tokens have no value. See{" "}
          <DocLink to="testnet">Testnet &amp; honesty</DocLink> for what has and has not been exercised.
        </p>
      </section>

      <section>
        <h2>The pieces</h2>
        <Diagram spec={MAP} />
        <div className="docs-facts">
          <KV
            rows={[
              ["Bitcoin testnet3", "where tickets are paid and where every token's owner is: a token sits on a Bitcoin output"],
              ["RGB++", "binds a CKB record to a Bitcoin output, so spending the output is the only way to move the record"],
              ["CKB", "a chain whose records (cells) can carry data and scripts; the token balances live there"],
              ["xUDT", "the standard CKB token format, readable by any wallet that understands RGB++ assets"],
              ["Mint script", "a Rust program on CKB that accepts a mint only for a paid ticket, enough work and the exact reward"],
              ["Browser miner", "a WebGPU shader, with CPU workers as fallback, searching for a hash with many leading zeros"],
              ["Index", "one Cloudflare Worker that relays signed launches, listings and activity; it can hide an entry, never forge one"],
            ]}
          />
        </div>
      </section>

      <section>
        <h2>Where to go next</h2>
        <ul>
          <li>
            <DocLink to="tokenomics">Tokenomics</DocLink> — the ticket, the reward and the halving, identical for every launch.
          </li>
          <li>
            <DocLink to="mint">The mint circuit</DocLink> — each step, and when the tokens are delivered.
          </li>
          <li>
            <DocLink to="ownership">Where a token lives</DocLink> and <DocLink to="transfers">transfers</DocLink>.
          </li>
          <li>
            <DocLink to="market">The market</DocLink> — buying and selling without anyone holding the goods.
          </li>
          <li>
            <DocLink to="verification">Verification</DocLink> — checking a mint yourself.
          </li>
        </ul>
        <Technical>
          <ul>
            <li>
              <strong>Wallet.</strong> A passkey (WebAuthn PRF) yields 32 bytes of entropy, which become a BIP39 mnemonic
              and the BIP84 key at <code>m/84'/1'/0'/0/0</code> — a standard path, so the coins can be swept by any BIP39
              wallet. A demo key kept in the browser is also available.
            </li>
            <li>
              <strong>Mining.</strong> A WGSL compute shader grinds SHA-256d over a fixed 40-byte preimage (the 32-byte
              challenge and an 8-byte nonce); CPU workers do the same where WebGPU is missing. Every candidate the GPU reports
              is hashed again on the CPU before the page believes it.
            </li>
            <li>
              <strong>Settlement.</strong> The app computes the CKB transaction and its RGB++ commitment, signs the Bitcoin
              transaction, and hands the CKB side to the public RGB++ queue service. The service can delay or fail to
              submit, but it cannot change what was committed; anyone could complete the transaction with a proof from
              another source.
            </li>
            <li>
              <strong>Index.</strong> One Cloudflare Worker over D1 serves the app and <code>/api</code>. It stores events
              already signed by their author, checks each signature with the same code the browser uses, and returns them
              for the browser to check again. It holds no ledger and gives no verdict of its own.
            </li>
            <li>
              The canonical specification is <code>PROTOCOL.md</code> in the repository; these pages follow it.
            </li>
          </ul>
        </Technical>
      </section>
    </>
  );
}
