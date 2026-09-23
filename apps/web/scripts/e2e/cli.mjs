/* The end-to-end wallet, from the command line.
 *
 *   npm run e2e:wallet            create it if absent, print the address
 *   npm run e2e:balance           what it holds, and whether a run can proceed
 *   npm run e2e:wallet -- --seed  print the recovery phrase (prompts nothing)
 */

import { argv, exit } from "node:process";
import { assertTestnet, ensureWallet, balanceOf, WALLET_FILE } from "./wallet.mjs";
import { close } from "./load.mjs";

const command = argv[2] ?? "wallet";

try {
  const network = await assertTestnet();

  if (command === "wallet") {
    const { created, address, mnemonic } = await ensureWallet();

    console.log(`\n${created ? "Created" : "Existing"} end-to-end wallet on ${network.label}\n`);
    console.log(`  address   ${address}`);
    console.log(`  key file  ${WALLET_FILE}  (git-ignored, chmod 600)`);

    if (argv.includes("--seed")) {
      console.log(`\n  recovery phrase (BIP39, path m/84'/1'/0'/0/0):\n\n    ${mnemonic}\n`);
    } else {
      console.log(`\n  Run with --seed to print the recovery phrase.`);
    }

    if (created) {
      console.log(`\nFund it, then run \`npm run e2e\`. Faucets:`);
      for (const f of network.faucets) console.log(`  ${f.name.padEnd(22)} ${f.url}`);
      console.log(
        `\nAbout 5,000 sat covers one full run (ticket + fee). 100,000 sat is\n` +
          `roughly twenty runs. Testnet coins have no value; never send real bitcoin\n` +
          `to this address.`,
      );
    }
    console.log();
  } else if (command === "balance") {
    const { address } = await ensureWallet();
    const { total, pending, utxos } = await balanceOf(address);
    const confirmed = total - pending;

    console.log(`\n  ${address}`);
    console.log(`  confirmed  ${confirmed} sat`);
    console.log(`  pending    ${pending} sat`);
    console.log(`  utxos      ${utxos.length}`);
    console.log(`  explorer   ${network.explorer}/address/${address}`);
    console.log(
      confirmed >= 2_400 ? `\n  Enough for a run.\n` : `\n  Not enough for a run yet.\n`,
    );
  } else {
    console.error(`Unknown command "${command}". Use "wallet" or "balance".`);
    await close();
    exit(1);
  }
} catch (err) {
  console.error(`\n${err.message}\n`);
  await close();
  exit(1);
}

await close();
