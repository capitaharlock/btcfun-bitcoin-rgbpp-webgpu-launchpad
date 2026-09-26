/* btc.fun's signer, as the create flow sees it.
 *
 * A launch is admitted by a certificate over its terms and its paid
 * registration (decision `2026-09-25-paid-registration-and-certificate`).
 * The site's Worker signs it at `POST /api/certify`; the testnet scripts ask
 * the deployed site's signer instead of their own origin, and a test answers
 * with a certificate signed under the published test key. One interface, so
 * the retry loop in `app/launches/registration.ts` is written once.
 */

export interface Certifier {
  /**
   * The certificate over `args` (the encoded terms) for the registration paid
   * by `registrationTxid`. Throws `RegistrationNotSeen` while the signer has
   * not found the payment on Bitcoin, and any other error for a refusal.
   */
  certify(args: Uint8Array, registrationTxid: string): Promise<string>;
}

/**
 * The signer has not seen the registration yet. Not a failure: Bitcoin's
 * explorers learn of a transaction seconds after it is sent, so the request is
 * simply repeated.
 */
export class RegistrationNotSeen extends Error {}
