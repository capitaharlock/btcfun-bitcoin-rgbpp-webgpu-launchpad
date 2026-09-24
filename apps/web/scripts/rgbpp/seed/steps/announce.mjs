/* announce: sign the official launches, register each through the site's
 * certificate signer like anyone's launch, and publish them to the index. */

import { alice, create, network, provider, register, vaultOf } from "../../kit.mjs";
import { EXTRAS, OFFICIAL } from "../catalogue.mjs";
import { publish } from "../publish.mjs";
import { state, write } from "../state.mjs";

export async function announce() {
  const tip = await provider.getTipHeight(network.ACTIVE);
  const identity = vaultOf(alice).identity;
  for (const [symbol, name, blurb, accent] of OFFICIAL) {
    if (state.launches.some((l) => l.symbol === symbol)) continue;
    const draft = {
      symbol, name, blurb, accent, promoter: alice.address, opensInBlocks: 1,
      links: Object.fromEntries(create.LINK_KINDS.map((k) => [k, ""])),
      story: { why: "", plan: "" },
      image: EXTRAS[symbol]?.[3] ?? "",
    };
    const faults = create.validate(draft, network.ACTIVE);
    if (Object.keys(faults).length > 0) throw new Error(`${symbol}: ${JSON.stringify(faults)}`);
    // Registered like anyone's launch: paid, then certified by the site's signer.
    // A payment already sent is kept first, so a retry never pays twice.
    state.registrations ??= {};
    const h0 = state.registrations[symbol]?.h0 ?? tip + draft.opensInBlocks;
    const admitted = await register(alice, draft, h0, state.registrations[symbol] ?? null);
    state.registrations[symbol] = admitted.registration;
    write();
    const commitment = create.commitmentFor(draft, identity, admitted.registration, admitted.certificate, network.ACTIVE);
    if (!create.idMatches(commitment, network.ACTIVE)) throw new Error(`${symbol}: the certificate does not verify`);
    await publish(alice, {
      kind: "launch",
      launch: commitment.id,
      ref: create.commitmentId(commitment),
      meta: JSON.stringify(commitment),
    });
    state.launches.push(commitment);
    write();
    console.log(`announced ${commitment.id}, opens at ${commitment.h0}`);
  }
}
