import { describe, expect, it } from "vitest";

import { deriveKey } from "@/domain/bitcoin";
import { TESTNET3 } from "@/domain/bitcoin";
import { InsufficientFunds } from "@/domain/bitcoin";
import type { Utxo } from "@/domain/bitcoin";
import { ARM_SHAPE, fundingNeeded, mintShape, networkFee, plainFunding, shapeOf, signOperation, strippedTx } from "./transaction";
import { TESTNET } from "./config";
import { metadataHash, type LaunchTerms } from "./launch";
import { displayTxid } from "@/domain/bitcoin";
import { planArm } from "./plans/arm";
import { planMint } from "./plans/mint";
import { planTicket } from "./plans/ticket";
import { SEAL_SATS } from "./plans/plan";
import type { MinerCell } from "./cells/miner";
import { NEW_CELL, REUSE } from "@/domain/protocol";

const key = deriveKey(new Uint8Array(32).fill(7), TESTNET3);
const terms: LaunchTerms = {
  h0: 4_800_000,
  metadataHash: metadataHash({ name: "Mesh", symbol: "MESH", description: "", imageHash: "" }),
  promoterScript: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0xaa)]),
};
/** Any 96 bytes: plans carry the admission, the script checks it. */
const ADMISSION = new Uint8Array(96).fill(3);
const paymaster = { address: "tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj", feeSats: 7000 };
const idle: MinerCell = {
  outPoint: { txHash: "0x" + "12".repeat(32), index: 0 },
  capacity: 50_000_000_000n,
  seal: { txid: "34".repeat(32), vout: 1 },
  data: { state: "idle", nonce: 0n, anchor: 0 },
};
const sealUtxo: Utxo = { txid: idle.seal.txid, vout: idle.seal.vout, value: SEAL_SATS, confirmed: true };
const coin = (value: number, n = 0): Utxo => ({ txid: String(n).padStart(64, "5"), vout: 0, value, confirmed: true });

describe("funding an operation", () => {
  it("takes only confirmed plain coins, never a seal or an output still landing", () => {
    const landing = coin(9_000, 3);
    const utxos = [coin(20_000, 1), { ...coin(8_000, 2), confirmed: false }, sealUtxo, landing];
    expect(plainFunding(utxos, new Set([landing.txid]))).toEqual([coin(20_000, 1)]);
  });

  const armed: MinerCell = { ...idle, data: { state: "armed", nonce: 0n, anchor: terms.h0 } };
  const held = { outPoint: { txHash: "0x" + "56".repeat(32), index: 0 }, capacity: 20_000_000_000n, seal: { txid: "78".repeat(32), vout: 2 }, amount: 5n };
  const heldUtxo: Utxo = { txid: held.seal.txid, vout: 2, value: SEAL_SATS, confirmed: true };
  const creating = Uint8Array.from([1, 2, 3]);
  const paid: MinerCell = { ...idle, seal: { txid: displayTxid(creating), vout: 1 }, data: { state: "paid", nonce: 0n, anchor: 0 } };
  const paidUtxo: Utxo = { txid: paid.seal.txid, vout: 1, value: SEAL_SATS, confirmed: true };

  for (const [name, plan, sealed] of [
    ["a re-arming ticket", planTicket(TESTNET, terms, { idle, paymaster: null, tip: terms.h0 }), [sealUtxo]],
    ["a ticket that creates its cell", planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 }), []],
    ["an arming", planArm(TESTNET, terms, paid, creating, terms.h0, ADMISSION), [paidUtxo]],
    ["a first mint", planMint(TESTNET, terms, { miner: armed, held: null, nonce: 1n, reward: 1n }), [sealUtxo]],
    ["a later mint", planMint(TESTNET, terms, { miner: armed, held, nonce: 1n, reward: 1n }), [sealUtxo, heldUtxo]],
  ] as const) {
    it(`estimates exactly what signing ${name} takes from one coin`, () => {
      for (const feeRate of [1, 3, 12]) {
        const needed = fundingNeeded(plan, feeRate, TESTNET3);
        expect(() => signOperation(key, plan, sealed, [coin(needed)], feeRate, TESTNET3)).not.toThrow();
        expect(() => signOperation(key, plan, sealed, [coin(needed - 1)], feeRate, TESTNET3)).toThrow(InsufficientFunds);
      }
    });
  }

  it("sizes an arming and a mint before they exist, by the rule that signs them", () => {
    const arm = planArm(TESTNET, terms, paid, creating, terms.h0, ADMISSION);
    const first = planMint(TESTNET, terms, { miner: armed, held: null, nonce: 1n, reward: 1n });
    const later = planMint(TESTNET, terms, { miner: armed, held, nonce: 1n, reward: 1n });
    for (const rate of [3, 17]) {
      expect(fundingNeeded(ARM_SHAPE, rate, TESTNET3)).toBe(fundingNeeded(arm, rate, TESTNET3));
      expect(fundingNeeded(mintShape(false), rate, TESTNET3)).toBe(fundingNeeded(first, rate, TESTNET3));
      expect(fundingNeeded(mintShape(true), rate, TESTNET3)).toBe(fundingNeeded(later, rate, TESTNET3));
      expect(fundingNeeded(shapeOf(later), rate, TESTNET3)).toBe(fundingNeeded(later, rate, TESTNET3));
    }
    // A mint pays the network and nothing else: its seals come back.
    expect(fundingNeeded(mintShape(true), 3, TESTNET3)).toBe(networkFee(mintShape(true), 3, TESTNET3));
  });

  it("prices each ticket at its split plus the network, less the seal it spends", () => {
    const rearm = planTicket(TESTNET, terms, { idle, paymaster: null, tip: terms.h0 });
    const create = planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 });
    expect(fundingNeeded(rearm, 3, TESTNET3)).toBe(REUSE.platform + REUSE.promoter + networkFee(shapeOf(rearm), 3, TESTNET3));
    expect(fundingNeeded(create, 3, TESTNET3)).toBe(
      SEAL_SATS + NEW_CELL.platform + NEW_CELL.promoter + paymaster.feeSats + networkFee(shapeOf(create), 3, TESTNET3),
    );
  });

  /* Captured before coin selection moved to `domain/bitcoin` `selectCoins`:
   * seals first, then funding, change when it clears dust. */
  it("signs the same bytes it always did", () => {
    const later = planMint(TESTNET, terms, { miner: armed, held, nonce: 1n, reward: 1n });
    const sealed = [sealUtxo, heldUtxo];
    // One coin worth exactly what is needed: no change output.
    expect(signOperation(key, later, sealed, [coin(fundingNeeded(later, 3, TESTNET3))], 3, TESTNET3).hex).toBe(
      "0200000000010334343434343434343434343434343434343434343434343434343434343434340100000000ffffffff78787878787878787878787878787878787878787878787878787878787878780200000000ffffffff50555555555555555555555555555555555555555555555555555555555555550000000000ffffffff030000000000000000226a20cf2487fac19c9ad9394f4a66ee807a293c5252cd035b0c664bd2dcf7a76713a922020000000000001600148b55e957a158613346a809781cb69f8c8f81247d22020000000000001600148b55e957a158613346a809781cb69f8c8f81247d024730440220259231b916a03e38f1324e0ccc1d749a095ddf6f049f61364c09fd6f7333fcf702200f2629bd0e06963c7dcb40b90bc1e0af38d099b53cc6f4b21ca0798420095a45012103ca60aac8232d9fceefb4bb7f85f25dbf90f88f2595f8c455b9719c25950575b002483045022100f5509889739c2f040dff52c4620fd1bb4947bbb2def2170a8f2e8e3cf22e315902200d0ba6a6fad3b8ce6326676ea02842633a38d33c2553564f00eae53910866056012103ca60aac8232d9fceefb4bb7f85f25dbf90f88f2595f8c455b9719c25950575b0024830450221008a27937f4109122865ecdf8fd9b9568170c77b3ffbe4a8c354f0cc409c470df602206153f721e27859a255f7561cf041bff95010e62b39da2acd30c09eb602bc36e9012103ca60aac8232d9fceefb4bb7f85f25dbf90f88f2595f8c455b9719c25950575b000000000",
    );
    // The first coin suffices and leaves change; the second is left alone.
    expect(signOperation(key, later, sealed, [coin(30_000, 1), coin(20_000, 2)], 3, TESTNET3).hex).toBe(
      "0200000000010334343434343434343434343434343434343434343434343434343434343434340100000000ffffffff78787878787878787878787878787878787878787878787878787878787878780200000000ffffffff51555555555555555555555555555555555555555555555555555555555555550000000000ffffffff040000000000000000226a20cf2487fac19c9ad9394f4a66ee807a293c5252cd035b0c664bd2dcf7a76713a922020000000000001600148b55e957a158613346a809781cb69f8c8f81247d22020000000000001600148b55e957a158613346a809781cb69f8c8f81247d13710000000000001600148b55e957a158613346a809781cb69f8c8f81247d02483045022100c4a6503b07396961e8d38891cb130099734b1ec100a77d95d8996c0430190af802207b4fcd17c9f35cf062184faef10a265106af525425123e6d7d932625d4cbe0df012103ca60aac8232d9fceefb4bb7f85f25dbf90f88f2595f8c455b9719c25950575b0024730440220487b97fa12b7ae6878bd1f1ad298bc5dea16d4f84db844009236b7e486583e770220263e9606d789dfe69b78b96ccf515466d00cd4276800eaa198e089fd12eb60bb012103ca60aac8232d9fceefb4bb7f85f25dbf90f88f2595f8c455b9719c25950575b002473044022011bd885f967b7f2c949ca8458f846b88a616741b4744ee02de50404a44771f5e02207a4818c4bbfdae796b0365aaeb5c094f96094d4765c64f877fd81bf0d63b7fe4012103ca60aac8232d9fceefb4bb7f85f25dbf90f88f2595f8c455b9719c25950575b000000000",
    );
    const create = planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 });
    expect(signOperation(key, create, [], [coin(60_000)], 3, TESTNET3).hex).toBe(
      "0200000000010150555555555555555555555555555555555555555555555555555555555555550000000000ffffffff060000000000000000226a20ec7f696ad63fdad7a33302d90e657141516e235f3014b1cd4ea71cb575d5439f22020000000000001600148b55e957a158613346a809781cb69f8c8f81247dc11b000000000000160014aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa6e03000000000000160014f5c1e4b7673e5dfaa348f7cfaa7d73ef0a97a3be581b0000000000001600145d07e455f22c615d623b6cc98c281012974f180978aa0000000000001600148b55e957a158613346a809781cb69f8c8f81247d0247304402203653f98b959e27b58739a43f51e5e521ec0f43ae7326804bf50b72fa93f524d60220795454c8e0b98a259b98c953f6fdbc64f9b6cf43060aa9abf0f160411d76cc2f012103ca60aac8232d9fceefb4bb7f85f25dbf90f88f2595f8c455b9719c25950575b000000000",
    );
  });

  it("strips a signed segwit transaction to exactly what its txid hashes", () => {
    const plan = planTicket(TESTNET, terms, { idle: null, paymaster, tip: terms.h0 });
    const signed = signOperation(key, plan, [], [coin(60_000)], 3, TESTNET3);
    expect(signed.hex.slice(8, 12)).toBe("0001"); // the segwit marker and flag
    expect(displayTxid(strippedTx(signed.hex))).toBe(signed.txid);
  });
});
