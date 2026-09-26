/* refresh: re-sign the announced official launches with their links, story
 * and image, keeping each launch id. */

import { alice, image, launches, network } from "../../kit.mjs";
import { EXTRAS } from "../catalogue.mjs";
import { publish } from "../publish.mjs";
import { state, write } from "../state.mjs";

export async function refresh() {
  for (const commitment of state.launches) {
    const extra = EXTRAS[commitment.symbol];
    if (!extra) continue;
    const [website, why, plan, picture] = extra;
    const links = Object.fromEntries(launches.LINK_KINDS.map((k) => [k, k === "website" ? website : ""]));
    const story = { why, plan };
    if (image.imageFor(picture) !== picture) throw new Error(`${commitment.id}: ${picture} is not an acceptable image`);
    const updated = { ...commitment, ...launches.extrasOf({ links, story }), image: picture, at: new Date().toISOString() };
    if (!launches.idMatches(updated, network.ACTIVE)) throw new Error(`${commitment.id}: links changed the id`);
    await publish(alice, { kind: "launch", launch: updated.id, ref: launches.commitmentId(updated), meta: JSON.stringify(updated) });
    Object.assign(commitment, updated);
    write();
    console.log(`${commitment.id}: links, story and image published`);
  }
}
