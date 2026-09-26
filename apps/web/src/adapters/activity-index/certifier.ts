/* btc.fun's signer over HTTP: `POST /api/certify` on the same Worker as the
 * index (`worker/certify.ts`). The origin is a parameter because the testnet
 * scripts ask the deployed site, not their own. */

import { bytesToHex } from "@/domain/codec";
import { RegistrationNotSeen, type Certifier } from "@/ports";

export function httpCertifier(origin = ""): Certifier {
  return {
    async certify(args, registrationTxid) {
      const res = await fetch(`${origin}/api/certify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: bytesToHex(args), registration: registrationTxid }),
      });
      const body = (await res.json().catch(() => ({}))) as { certificate?: string; error?: string };
      if (res.status === 404) throw new RegistrationNotSeen(body.error ?? "The registration is not known to Bitcoin yet.");
      if (!res.ok || !body.certificate) throw new Error(body.error ?? `The certificate request failed (${res.status}).`);
      return body.certificate;
    },
  };
}
