/* The platform's key, for the test build only.
 *
 * The production build names the seed wallet's identity as the platform's
 * (`src/domain/launches/featured.ts`); the suite builds with this one instead
 * (`playwright.config.ts`), so a test can announce the platform's DEMO launch
 * by restoring the secret below. Both halves live here so they cannot drift.
 */

/** A fixed test secret. Worth nothing on any network. */
export const PLATFORM_SECRET = "d3".repeat(32);

/** The identity `PLATFORM_SECRET` restores to: its BIP84 testnet public key. */
export const PLATFORM_IDENTITY = "03675d0aca4810f104600d7507b17f89200aac3f7bb63bc40a9893450b0308a082";
