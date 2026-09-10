# Test binaries

- `rgbpp-lock-mock-light-client` — the RGB++ lock from `utxostack/rgbpp` at
  `4abd216`, built with `--features rgbpp-core/mock-bitcoin-light-client`. It
  runs every RGB++ check except the SPV lookup, so tests can use Bitcoin
  transactions that were never mined. The deployed lock performs that lookup;
  the live testnet run covers it.

The xUDT binary and the RGB++ config come from their deployed cells on CKB
testnet (`../deployed/`), and each is installed in the test context under the
same type-id script it has on chain, so the script hashes the mint script
trusts are the real ones.
