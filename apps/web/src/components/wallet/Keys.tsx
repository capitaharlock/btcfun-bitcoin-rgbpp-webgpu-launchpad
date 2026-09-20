/* How this wallet is protected, how to back it up, and how to leave it. */

import { useState } from "react";

import { exportLocalSecret, type Vault, type VaultKind } from "../../lib/bitcoin";
import { bytesToHex } from "../../lib/bytes";
import { NETWORK, useWallet } from "../../state/WalletProvider";
import { Copyable } from "../../ui/Copyable";
import { Dialog, KV, More, Notice, Panel } from "../../ui/primitives";

export function KeysPanel({ vault }: { vault: Vault }) {
  return (
    <Panel eyebrow="keys" title="Protection and recovery" aside={<LogOut vault={vault} />}>
      <KV
        rows={[
          ["Protection", vault.label],
          ["Derivation path", NETWORK.bip84Path],
          ["Identity", `${vault.identity.slice(0, 16)}…`],
        ]}
      />
      <More>
        <p>
          The identity is the public key every record is signed under. The address is standard BIP84, so the same
          mnemonic opens it in any BIP39 wallet — nothing here can trap your coins.
        </p>
      </More>
      {vault.kind === "local" && <SecretBackup />}
    </Panel>
  );
}

/** A browser key's only copy lives in this browser; this is how it leaves. */
function SecretBackup() {
  const [revealed, setRevealed] = useState(false);
  const secret = exportLocalSecret();
  if (!secret) return null;
  return (
    <div className="stack-sm">
      <Notice tone="warn">This key lives in browser storage. Anyone holding the secret holds the wallet.</Notice>
      {revealed ? (
        <Copyable value={bytesToHex(secret)} label="wallet secret" />
      ) : (
        <button className="btn" onClick={() => setRevealed(true)}>
          Reveal the wallet secret
        </button>
      )}
    </div>
  );
}

/** What logging out costs, which is different for each kind of wallet. */
const CONSEQUENCE: Record<VaultKind, string> = {
  passkey:
    "This browser forgets the wallet. Nothing is lost: connecting with the same passkey opens the same address again.",
  local:
    "This wallet's key exists only in this browser. Unless you have copied its secret, logging out loses the wallet — and everything on it — for good.",
  demo: "This browser stops using the demo wallet. Its key is built into the app, so you can open it again any time — and so can anyone else.",
};

/** The two ways out of a wallet: to another one, or to none. Both end on this
 *  page without a wallet, which is the chooser — so switching needs no step
 *  of its own after the log out. */
function LogOut({ vault }: { vault: Vault }) {
  const [leaving, setLeaving] = useState<"logout" | "switch" | null>(null);
  return (
    <>
      <div className="row wrapped">
        <button className="btn ghost" onClick={() => setLeaving("switch")}>
          Switch wallet
        </button>
        <button className="btn ghost" onClick={() => setLeaving("logout")}>
          Log out
        </button>
      </div>
      <LogOutDialog
        vault={vault}
        open={leaving !== null}
        switching={leaving === "switch"}
        onClose={() => setLeaving(null)}
      />
    </>
  );
}

/**
 * The one way out of a wallet, wherever it is asked for: what leaving costs
 * this kind of wallet, a last chance to copy a browser key's secret, and then
 * the log out. `switching` is the same step on the way to another wallet.
 */
export function LogOutDialog({
  vault,
  open,
  onClose,
  switching,
  onLoggedOut,
}: {
  vault: Vault;
  open: boolean;
  onClose: () => void;
  switching?: boolean;
  onLoggedOut?: () => void;
}) {
  const wallet = useWallet();
  const leave = () => {
    wallet.logOut();
    onLoggedOut?.();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="wallet"
      title={switching ? "Switch to another wallet?" : "Log out of this wallet?"}
    >
      <div className="stack-md">
        {switching && <p className="clamp">Switching logs this wallet out first, then opens the wallet chooser.</p>}
        <p className="clamp">{CONSEQUENCE[vault.kind]}</p>
        {vault.kind === "local" && <SecretBackup />}
        <div className="row wrapped">
          <button className="btn danger" onClick={leave}>
            {switching ? "Log out and switch" : "Log out"}
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
