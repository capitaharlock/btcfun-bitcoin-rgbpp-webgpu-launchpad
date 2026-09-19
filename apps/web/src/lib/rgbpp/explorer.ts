/* Pages on the CKB explorer for a launch's scripts.
 *
 * Built from the explorer configured for this network (`ACTIVE_RGBPP`), so a
 * mainnet build links to the mainnet explorer without a second hand-typed
 * address. The explorer's page for a token is keyed by the xUDT type hash —
 * which is the token id — and its page for a script by code hash and hash type.
 */

import { ACTIVE_RGBPP, type RgbppConfig } from "./config";

function root(config: RgbppConfig): string {
  return new URL(config.ckbExplorer).origin;
}

/** The token's page: every holder cell and transfer of this xUDT. */
export function ckbTokenUrl(tokenId: string, config: RgbppConfig = ACTIVE_RGBPP): string {
  return `${root(config)}/xudt/${tokenId}`;
}

/** The mint script's page: the deployed code every launch's miner cells run. */
export function ckbMintScriptUrl(config: RgbppConfig = ACTIVE_RGBPP): string {
  return `${root(config)}/script/${config.mint.codeHash}/${config.mint.hashType}`;
}
