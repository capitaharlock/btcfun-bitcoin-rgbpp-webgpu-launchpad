/* Deploy the mint script to CKB testnet, permanently.
 *
 * The code cell is locked by a secp256k1 lock whose args are twenty zero
 * bytes: a public-key hash nobody holds a key for. So the cell can never be
 * spent — not by whoever deployed it either — and the script every launch
 * names by its data hash cannot be withdrawn or swapped. Launches reference it
 * with `hash_type: data1`, which pins the exact bytes.
 *
 *   node scripts/ckb/deploy-mint.mjs [--dry-run]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ccc } from "@ckb-ccc/core";
import { client, committed, signer } from "./signer.mjs";

const BINARY = fileURLToPath(
  new URL("../../../../contracts/target/riscv64imac-unknown-none-elf/release/btcfun-mint", import.meta.url),
);
const RECORD = fileURLToPath(new URL("../../../../contracts/deployments/testnet.json", import.meta.url));

const code = readFileSync(BINARY);
const codeHash = ccc.hashCkb(code);
const deployer = signer(0);

const unspendable = await ccc.Script.fromKnownScript(client, ccc.KnownScript.Secp256k1Blake160, "0x" + "00".repeat(20));
const tx = ccc.Transaction.from({ outputs: [{ lock: unspendable }], outputsData: [ccc.hexFrom(code)] });
await tx.completeInputsByCapacity(deployer);
await tx.completeFeeBy(deployer, 1000);

console.log(`mint script: ${code.length} bytes, data hash ${codeHash}`);
console.log(`occupies ${ccc.fixedPointToString(tx.outputs[0].capacity)} CKB`);
if (process.argv.includes("--dry-run")) process.exit(0);

const txHash = await deployer.sendTransaction(tx);
console.log(`sent ${txHash}; waiting for commitment`);
await committed(txHash);

// A deployment is permanent, so an earlier one is kept in the record rather
// than overwritten: launches created against it still name its code hash.
const previous = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : null;
const superseded = previous
  ? [...(previous.superseded ?? []), { codeHash: previous.codeHash, cellDep: previous.cellDep, deployedAt: previous.deployedAt }]
  : [];

const record = {
  network: "ckb-testnet",
  script: "btcfun-mint",
  codeHash,
  hashType: "data1",
  cellDep: { outPoint: { txHash, index: "0x0" }, depType: "code" },
  bytes: code.length,
  lock: "secp256k1-blake160 with zero args: unspendable",
  deployedAt: new Date().toISOString(),
  build: previous?.build,
  superseded,
};
writeFileSync(RECORD, JSON.stringify(record, null, 2) + "\n");
console.log(`committed; recorded in contracts/deployments/testnet.json`);
process.exit(0);
