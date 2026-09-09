/* Wallet: connect, fund, inspect, recover.
 *
 * Everything on this page is a real fact about the active network. The address
 * is a standard BIP84 receive address, the balance is its UTXO set as
 * mempool.space reports it, and the link out lets anyone check both without
 * trusting this page — which is the §3 standard applied to the one screen where
 * a visitor is asked to put money in.
 */

import { useState } from "react";

import { NETWORK, formatBtc, shortAddress, useWallet } from "../state/WalletProvider";
import { addressUrl, exportLocalSecret } from "../lib/bitcoin";
import { bytesToHex, hexToBytes } from "../lib/bytes";
import { group } from "../lib/format";
import { Chip, KV, Notice, Panel, Stat } from "../ui/primitives";
import { Copyable } from "../ui/Copyable";

export function WalletView() {
  const wallet = useWallet();

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <div>
          <div className="eyebrow">wallet</div>
          <h1>Your keys on {NETWORK.label}</h1>
        </div>
        <span className="spacer" />
        <Chip tone="cyan">{NETWORK.label}</Chip>
        {wallet.tipHeight && <Chip tone="amber" live>btc {group(wallet.tipHeight)}</Chip>}
      </div>

      {wallet.vault ? <Connected /> : <Disconnected />}

      {wallet.error && <Notice tone="warn">{wallet.error}</Notice>}
    </div>
  );
}

function Disconnected() {
  const wallet = useWallet();
  const [restoring, setRestoring] = useState(false);
  const [secret, setSecret] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const restore = async () => {
    setRestoreError(null);
    const clean = secret.trim().toLowerCase();
    // Checked here rather than left to the decoder, whose message names an
    // internal function — accurate for a developer, meaningless to anyone else.
    if (!/^[0-9a-f]{64}$/.test(clean)) {
      setRestoreError(
        "A demo key secret is 64 hexadecimal characters: digits 0–9 and letters a–f.",
      );
      return;
    }
    try {
      await wallet.restoreLocal(hexToBytes(clean));
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="split">
      <Panel eyebrow="recommended" title="Passkey wallet">
        <p>
          Your key is derived from your device's authenticator — Touch&nbsp;ID,
          Face&nbsp;ID or Windows&nbsp;Hello — every time it is needed, and wiped
          straight after. There is no seed phrase to store and no private key on
          disk.
        </p>
        <KV
          rows={[
            ["Derivation", "WebAuthn PRF → BIP39 → BIP84"],
            ["Path", NETWORK.bip84Path],
            ["Stored here", "credential id only"],
          ]}
        />
        <div className="rule" />
        <button
          className="btn primary lg"
          disabled={wallet.busy || !wallet.passkeySupported}
          onClick={() => void wallet.connectPasskey()}
        >
          {wallet.busy ? "Waiting for your device…" : "Connect with a passkey"}
        </button>
        {!wallet.passkeySupported && (
          <Notice tone="warn">
            This browser does not expose WebAuthn, so the passkey path is
            unavailable here. The demo key below works anywhere.
          </Notice>
        )}
      </Panel>

      <Panel eyebrow="fallback" title="Demo key">
        <p>
          A random key kept in this browser's storage. Weaker than a passkey by
          construction — anything with access to this origin's storage can read
          it — and offered only so the demo runs where no authenticator exists.
          Put nothing on it you would mind losing.
        </p>
        <div className="row wrapped">
          <button className="btn" disabled={wallet.busy} onClick={() => void wallet.connectLocal()}>
            Create a demo key
          </button>
          <button className="btn ghost" onClick={() => setRestoring((r) => !r)}>
            {restoring ? "Cancel" : "Restore from a secret"}
          </button>
        </div>

        {restoring && (
          <div className="stack-sm" style={{ marginTop: 12 }}>
            <input
              className="input mono"
              placeholder="64 hex characters"
              value={secret}
              spellCheck={false}
              onChange={(e) => setSecret(e.target.value)}
            />
            <button className="btn" disabled={secret.trim().length !== 64} onClick={() => void restore()}>
              Restore
            </button>
            {restoreError && <Notice tone="warn">{restoreError}</Notice>}
          </div>
        )}
      </Panel>
    </section>
  );
}

function Connected() {
  const wallet = useWallet();
  const vault = wallet.vault!;
  const balance = wallet.balance;
  const [revealed, setRevealed] = useState(false);
  const secret = vault.kind === "local" ? exportLocalSecret() : null;

  return (
    <div className="stack-lg">
      <section className="split">
        <Panel
          eyebrow="receive"
          title="Address"
          aside={
            <button
              className="btn ghost"
              disabled={wallet.refreshing}
              onClick={() => void wallet.refresh()}
            >
              {wallet.refreshing ? "Refreshing…" : "Refresh"}
            </button>
          }
        >
          <Copyable value={vault.address} label="address" />
          <div className="row tiny faint" style={{ marginTop: 8 }}>
            <a href={addressUrl(vault.address)} target="_blank" rel="noreferrer">
              Inspect on mempool.space ↗
            </a>
            <span className="spacer" />
            <span>{vault.label}</span>
          </div>

          <div className="rule" />

          <div className="statrow">
            <Stat
              k="balance"
              v={balance ? formatBtc(balance.total) : "—"}
              unit="tBTC"
              tone="amber"
            />
            <Stat
              k="pending"
              v={balance ? formatBtc(balance.pending) : "—"}
              small
              hint="Unconfirmed, and spendable at your own risk"
            />
            <Stat k="utxos" v={balance ? balance.utxos.length : "—"} small />
          </div>
        </Panel>

        <Panel eyebrow="fund" title="Get testnet coins">
          <p>
            Tickets cost real satoshis on {NETWORK.label}. They are worthless
            play money, and the faucets below hand them out for nothing.
          </p>
          <div className="stack-sm">
            {NETWORK.faucets.map((faucet) => (
              <a key={faucet.url} className="btn" href={faucet.url} target="_blank" rel="noreferrer">
                {faucet.name} ↗
              </a>
            ))}
          </div>
          <div className="rule" />
          <Notice tone="cyan">
            Paste the address above into a faucet. The balance updates by itself
            within a few seconds of the transaction reaching the mempool.
          </Notice>
        </Panel>
      </section>

      <Panel eyebrow="keys" title="Recovery and identity">
        <KV
          rows={[
            ["Protection", vault.label],
            ["Derivation path", NETWORK.bip84Path],
            ["Identity", `${vault.identity.slice(0, 16)}…`],
          ]}
        />
        <div className="rule" />
        <p>
          The identity above is the public key every ledger record is signed
          under. The address is standard BIP84, so the same mnemonic opens it in
          any BIP39 wallet — nothing here can trap your coins.
        </p>

        {secret && (
          <div className="stack-sm">
            <Notice tone="warn">
              This demo key lives in browser storage. Copy it somewhere safe if
              you want the same wallet after clearing site data — or on another
              machine. Anyone holding it holds the wallet.
            </Notice>
            {revealed ? (
              <Copyable value={bytesToHex(secret)} label="demo key secret" />
            ) : (
              <button className="btn" onClick={() => setRevealed(true)}>
                Reveal the demo key secret
              </button>
            )}
          </div>
        )}

        <div className="rule" />
        <button className="btn ghost" onClick={wallet.disconnect}>
          Disconnect {shortAddress(vault.address)}
        </button>
      </Panel>
    </div>
  );
}
