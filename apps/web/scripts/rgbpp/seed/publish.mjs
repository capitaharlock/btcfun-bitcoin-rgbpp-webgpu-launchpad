/* Publishing to the activity index, and remembering what was published.
 *
 * Each event is signed by the wallet that acted, as the app signs its own, and
 * recorded in the run state so a run can tell what the index has heard.
 */

import { events, INDEX, vaultOf } from "../kit.mjs";
import { state, write } from "./state.mjs";

export async function publish(key, draft) {
  const signed = await events.signActivity(vaultOf(key), draft);
  const res = await fetch(`${INDEX}/api/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signed),
  });
  if (!res.ok) throw new Error(`index refused ${draft.kind}: ${res.status} ${await res.text()}`);
  state.published.push({ kind: draft.kind, launch: draft.launch, txid: draft.txid ?? null, at: signed.body.at });
  write();
}
