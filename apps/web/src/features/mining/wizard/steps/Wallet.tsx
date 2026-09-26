/* Wizard step 0: the wallet — pick one here, or see which one is in use. */

import { shortHash } from "@/ui/format";
import { useWallet } from "@/app/providers/WalletProvider";
import { TxLink } from "@/ui/TxLink";
import { ConnectOptions } from "@/features/wallet/Connect";

export function WalletBody() {
  const { vault } = useWallet();
  if (!vault) {
    return (
      <>
        <p className="wz-copy">Tickets and tokens belong to a Bitcoin address. Pick one — you stay on this page.</p>
        <ConnectOptions />
      </>
    );
  }
  return (
    <div className="wz-trace">
      <span className="wz-trace-label">{vault.kind === "demo" ? "Demo wallet" : vault.kind === "passkey" ? "Passkey" : "Browser key"}</span>
      <TxLink kind="address" id={vault.address} className="mono">
        {shortHash(vault.address, 10, 6)} ↗
      </TxLink>
    </div>
  );
}
