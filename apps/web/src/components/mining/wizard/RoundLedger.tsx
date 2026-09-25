/* The round's transactions in one line, above the wizard's frame.
 *
 * What is signed, what Bitcoin has confirmed, what is still to come — so the
 * person never has to guess which signature did what. The words come from
 * `ledgerOf` (`./progress.ts`), where they are tested.
 */

import type { MiningLoop } from "../../../hooks/useMiningLoop";
import { ledgerOf } from "./progress";

export function RoundLedger({ ml, symbol }: { ml: MiningLoop; symbol: string }) {
  const items = ledgerOf(ml, symbol);
  if (!items) return null;
  return (
    <ol className="wz-ledger" aria-label="This round">
      {items.map(({ label, p }) => (
        <li key={label} className={`tone-${p.tone}`}>
          <span className="wz-dot" aria-hidden="true">{p.tone === "done" ? "✓" : p.tone === "wait" ? "◌" : p.tone === "act" ? "●" : "○"}</span>
          <span className="wz-ledger-k">{label}</span>
          <span className="wz-ledger-v">{p.word}</span>
        </li>
      ))}
    </ol>
  );
}
