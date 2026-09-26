/* The certificate key every test build trusts.
 *
 * A leaf on purpose: the unit and browser configurations import it before any
 * module alias is set up, so it must depend on nothing. The secret is public
 * (`0x42` × 32) and `contracts/mint-core` builds the test script to trust the
 * same key; a production build never sets it.
 */

export const TEST_CERT_SECRET = "42".repeat(32);
export const TEST_CERT_KEY = "24653eac434488002cc06bbfb7f10fe18991e35f9fe4302dbea6d2353dc0ab1c";
