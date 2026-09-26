/* Getting a wallet: your own, behind a passkey, or the shared demo one.
 *
 * Two choices and no more, because they answer two different people. Someone
 * who means to keep what they mint wants their own key; someone who was sent a
 * link wants to see a mint happen in the next minute, without a faucet. The
 * browser-stored key and restore-from-secret stay available, one line down,
 * for machines with no authenticator and for moving a wallet between them.
 */

import { useId, useState } from "react";

import { hexToBytes } from "../../lib/bytes";
import { NETWORK, useWallet } from "../../state/WalletProvider";
import { Dialog, KV, More, Notice } from "../../ui/primitives";
import "./wallet.css";

/** The chooser, as it appears in the dialog and on the wallet page alike. */
export function ConnectOptions({ onConnected }: { onConnected?: () => void }) {
  const wallet = useWallet();
  const [restoring, setRestoring] = useState(false);
  const id = useId();

  // Failures surface through `wallet.error`; the rejection only stops the
  // success path from running.
  const attempt = (connect: () => Promise<void>) => () =>
    void connect().then(() => onConnected?.(), () => undefined);

  return (
    <div className="stack-md">
      <div className="choices">
        <section className="choice" aria-labelledby={`${id}-own`}>
          <div className="eyebrow">keep what you mint</div>
          <h3 id={`${id}-own`}>Your wallet — passkey</h3>
          <p className="clamp">
            Touch&nbsp;ID, Face&nbsp;ID or Windows&nbsp;Hello. Opens the wallet this passkey already holds, or creates one.
            No seed phrase, no key on disk.
          </p>
          <button
            className="btn primary block"
            disabled={wallet.busy || !wallet.passkeySupported}
            onClick={attempt(wallet.connectPasskey)}
          >
            {wallet.busy ? "Waiting for your device…" : "Connect with a passkey"}
          </button>
          {!wallet.passkeySupported && (
            <Notice tone="warn">This browser has no WebAuthn. Use a browser key below, or the demo wallet.</Notice>
          )}
          <p className="tiny faint alt">
            No passkey here?{" "}
            <button type="button" className="linkbutton" disabled={wallet.busy} onClick={attempt(wallet.connectLocal)}>
              Create a browser key
            </button>{" "}
            ·{" "}
            <button
              type="button"
              className="linkbutton"
              aria-expanded={restoring}
              onClick={() => setRestoring((r) => !r)}
            >
              Restore from a secret
            </button>
          </p>
          {restoring && <RestoreForm onRestored={onConnected} />}
          <More>
            <p>
              A passkey wallet's key is derived from your device's authenticator every time it is needed, and wiped
              straight after. A browser key is weaker by construction: it is kept in this browser's storage, where
              anything running on this site can read it.
            </p>
            <KV
              rows={[
                ["Derivation", "WebAuthn PRF → BIP39 → BIP84"],
                ["Path", NETWORK.bip84Path],
                ["Stored here", "credential id only"],
              ]}
            />
          </More>
        </section>

        <section className="choice" aria-labelledby={`${id}-demo`}>
          <div className="eyebrow">try it in a minute</div>
          <h3 id={`${id}-demo`}>Demo wallet — shared, {NETWORK.label} only</h3>
          <p className="clamp">
            One wallet built into the app and shared by everyone trying it out. Its key is public, so anyone can use
            it — and spend what is on it.
          </p>
          <button className="btn block" disabled={wallet.busy} onClick={attempt(wallet.connectDemo)}>
            Use the demo wallet
          </button>
        </section>
      </div>
      {wallet.error && <Notice tone="warn">{wallet.error}</Notice>}
    </div>
  );
}

function RestoreForm({ onRestored }: { onRestored?: () => void }) {
  const wallet = useWallet();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    setError(null);
    const clean = secret.trim().toLowerCase();
    // Checked here rather than left to the decoder, whose message names an
    // internal function — accurate for a developer, meaningless to anyone else.
    if (!/^[0-9a-f]{64}$/.test(clean)) {
      setError("A wallet secret is 64 hexadecimal characters: digits 0–9 and letters a–f.");
      return;
    }
    try {
      await wallet.restoreLocal(hexToBytes(clean));
      onRestored?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="stack-sm">
      <input
        className="input mono"
        placeholder="64 hex characters"
        aria-label="Wallet secret"
        value={secret}
        spellCheck={false}
        onChange={(e) => setSecret(e.target.value)}
      />
      <button className="btn" disabled={secret.trim().length !== 64} onClick={() => void restore()}>
        Restore
      </button>
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}

/** The chooser in a dialog, opened from the top bar. */
export function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} eyebrow="wallet" title="Connect a wallet" wide>
      <ConnectOptions onConnected={onClose} />
    </Dialog>
  );
}
