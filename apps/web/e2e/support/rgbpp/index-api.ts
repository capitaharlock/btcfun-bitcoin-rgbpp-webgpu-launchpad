/* btc.fun's own API, simulated: the activity index and the certificate signer.
 *
 * The index accepts an event only when `faultIn` — the same check the Worker
 * runs — finds nothing wrong, and serves events newest first. The signer
 * certifies a launch as the Worker does, over the simulated chain and with the
 * published test key.
 */

import type { Route } from "@playwright/test";

import type { SignedActivity } from "../../../src/domain/activity/types";
import { activityId, faultIn } from "../../../src/domain/activity/verify";
import { registrationFault, signCertificate, TEST_CERT_SECRET } from "../../../src/domain/launches/certificate";
import { hex } from "../bytes";
import type { RgbppSim } from "./index";
import { PLATFORM_SCRIPT } from "./oracle";

export async function answerIndex(sim: RgbppSim, route: Route): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "POST") {
    const signed = JSON.parse(request.postData() ?? "{}") as SignedActivity;
    const fault = faultIn(signed);
    if (fault) return route.fulfill({ status: 400, json: { error: fault } });
    const id = activityId(signed.body);
    if (!sim.events.some((e) => e.id === id)) {
      sim.events.push({ id, signed, receivedAt: Math.floor(Date.now() / 1000) + sim.events.length, authentic: true });
    }
    return route.fulfill({ status: 201, json: { id } });
  }
  const kind = url.searchParams.get("kind");
  const launch = url.searchParams.get("launch");
  const limit = Number(url.searchParams.get("limit") ?? 60);
  const events = sim.events
    .filter((e) => (!kind || e.signed.body.kind === kind) && (!launch || e.signed.body.launch === launch))
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .slice(0, limit);
  return route.fulfill({ json: { events } });
}

/** btc.fun's signer, as the Worker runs it, over the simulated chain and with the test key. */
export async function answerCertify(sim: RgbppSim, route: Route): Promise<void> {
  const { args, registration } = JSON.parse(route.request().postData() ?? "{}") as { args: string; registration: string };
  const tx = sim.chain.broadcasts.find((b) => b.txid === registration);
  // An explorer that has not heard of the payment yet, as happens seconds after it is sent.
  const unseen = sim.unseenCertifications > 0;
  if (unseen) sim.unseenCertifications--;
  if (!tx || unseen) return route.fulfill({ status: 404, json: { error: "That registration transaction is not known to Bitcoin yet." } });
  const bytes = hex.decode(args);
  const fault = registrationFault(tx.outputs.map((o) => ({ scriptHex: o.script, value: Number(o.amount) })), bytes, PLATFORM_SCRIPT);
  if (fault) return route.fulfill({ status: 422, json: { error: `That transaction does not register this launch: ${fault}.` } });
  const certificate = signCertificate(bytes, registration, hex.decode(TEST_CERT_SECRET));
  return route.fulfill({ json: { certificate: hex.encode(certificate) } });
}
