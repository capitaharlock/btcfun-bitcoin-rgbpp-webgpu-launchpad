/* A `Ledger` backed by a file, for runs outside a browser.
 *
 * `LocalLedger` is a localStorage adapter and Node has no localStorage. Rather
 * than shim the web API — which would test the shim — this satisfies the same
 * `Ledger` port with a file, which is exactly the substitution the port exists
 * for. `replay` is still the only thing that produces state, so the rules being
 * exercised are the shipped ones.
 */

import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";

export function createFileLedger({ path, rules, replay, decodeChain }) {
  const read = () => {
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, "utf8");
    if (raw.trim() === "") return [];
    // Decode rather than cast, for the same reason the app does: a run that
    // silently accepted a malformed chain would report a balance nobody can
    // reproduce.
    return decodeChain(JSON.parse(raw));
  };

  const write = (records) => writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`);

  return {
    get launch() {
      return rules.launch;
    },
    records: read,
    state: () => replay(read(), rules),
    append(record) {
      const next = [...read(), record];
      const state = replay(next, rules); // throws before anything is written
      write(next);
      return state;
    },
    clear() {
      rmSync(path, { force: true });
    },
  };
}
