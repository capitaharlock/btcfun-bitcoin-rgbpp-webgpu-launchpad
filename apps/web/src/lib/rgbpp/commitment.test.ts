import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";
import { commitment } from "./commitment";
import { TESTNET } from "./config";
import { PLACEHOLDER_TXID, pendingLock, rgbppLock, sealArgs, sealFromArgs } from "./seal";

const txid = "420ef844159984edc8519d087ea3bf67b0172e2a4d400ee51b6fc564b2729431";

describe("seals", () => {
  it("store the txid in internal byte order after a little-endian index", () => {
    const args = sealArgs({ txid, vout: 2 });
    expect(args.slice(2, 10)).toBe("02000000");
    expect(args.slice(10, 12)).toBe(txid.slice(62, 64));
    expect(sealFromArgs(args)).toEqual({ txid, vout: 2 });
  });

  it("a pending seal is the all-zero txid", () => {
    expect(sealFromArgs(pendingLock(TESTNET, 1).args).txid).toBe(PLACEHOLDER_TXID);
  });
});

describe("commitment", () => {
  it("matches the RGB++ SDK for a mint-shaped transaction", () => {
    // A fixed type script, not the live deployment, so the vector below does
    // not change when the mint script is redeployed.
    const mintType = ccc.Script.from({
      codeHash: "0x73ea88fed086c1959c0ae66a95cb125d132a8edc19e46369b14c90927ea20616",
      hashType: "data1",
      args: "0x01" + "00".repeat(40),
    });
    const tx = {
      inputs: [
        { txHash: "0x" + "ab".repeat(32), index: 0 },
        { txHash: "0x" + "cd".repeat(32), index: 3 },
      ],
      outputs: [
        { capacity: ccc.fixedPointFrom(200), lock: pendingLock(TESTNET, 1), type: mintType },
        {
          capacity: ccc.fixedPointFrom(162),
          lock: rgbppLock(TESTNET, { txid, vout: 0 }),
          type: ccc.Script.from({ ...TESTNET.xudt, args: "0x" + "ee".repeat(36) }),
        },
      ],
      outputsData: ["0x000102030405060708", "0x" + "11".repeat(16)],
    };
    // Computed by `calculateCommitment` in @rgbpp-sdk/ckb 0.7.4 for this exact
    // transaction, and reproduced independently by the RGB++ lock in
    // contracts/tests. Kept as a constant so the SDK is not a dependency.
    expect(commitment(tx)).toBe("0xa654f6aea905e5b0928e8f706e7902f8026fa4681c2a06f83dcaa27c4de524f8");
  });
});
