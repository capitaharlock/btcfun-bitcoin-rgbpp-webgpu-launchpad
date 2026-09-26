/* The wallet: what it is, what it holds, what it did.
 *
 * One place with three tabs, because they are one question — "what is mine?"
 * — at three depths: the overview answers it in a glance (address, balance,
 * how many tokens), Tokens lists and moves them, Activity shows what this
 * wallet signed. Each tab is a route, so it can be linked, bookmarked and
 * reached with the back button.
 *
 * Everything on these screens is a real fact about the active network. The
 * address is a standard BIP84 receive address, the balance is its UTXO set as
 * mempool.space reports it, and the links out let anyone check both without
 * trusting this page.
 */

import { ConnectOptions } from "../components/wallet/Connect";
import { DemoBadge } from "../components/wallet/DemoBadge";
import { KeysPanel } from "../components/wallet/Keys";
import { WalletActivity } from "../components/wallet/Operations";
import { WalletTokens } from "../components/wallet/Tokens";
import { useLaunchByToken } from "../hooks/useLaunches";
import type { Vault } from "../lib/bitcoin";
import { atoms, group } from "../lib/format";
import { positionsOf } from "../lib/holdings";
import { DECIMALS } from "../lib/standard";
import { useTokens } from "../state/TokensProvider";
import { NETWORK, formatBtc, useWallet } from "../state/WalletProvider";
import { Copyable } from "../ui/Copyable";
import { Chip, More, Notice, PageHead, Panel, Stat } from "../ui/primitives";
import { QrCode } from "../ui/QrCode";
import { TokenImage } from "../ui/TokenImage";
import { ExternalLink, TxLink } from "../ui/TxLink";
import type { WalletTab } from "../lib/router";
import "../components/wallet/wallet.css";

export const WALLET_TABS: ReadonlyArray<{ tab: WalletTab; path: string; label: string }> = [
  { tab: "overview", path: "/wallet", label: "Overview" },
  { tab: "tokens", path: "/wallet/tokens", label: "Tokens" },
  { tab: "activity", path: "/wallet/activity", label: "Activity" },
];

/** How many tokens the overview names before pointing at the Tokens tab. */
const TOP_HOLDINGS = 3;

const KIND_EYEBROW: Record<Vault["kind"], string> = {
  passkey: "your wallet · passkey",
  local: "your wallet · browser key",
  demo: "demo wallet · shared",
};

export function WalletView({ tab }: { tab: WalletTab }) {
  const wallet = useWallet();

  if (!wallet.vault) {
    return (
      <div className="stack-lg">
        <PageHead
          eyebrow="wallet"
          title="Connect a wallet"
          lede="Tickets and tokens belong to a Bitcoin address. Pick where yours comes from."
          aside={<Chip tone="cyan">{NETWORK.label}</Chip>}
        />
        <ConnectOptions />
      </div>
    );
  }

  const vault = wallet.vault;
  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="wallet"
        title="Your wallet"
        lede="Your Bitcoin address, its balance, and the tokens sealed to it."
        aside={
          <>
            <DemoBadge />
            <Chip tone="cyan">{NETWORK.label}</Chip>
            {wallet.tipHeight && <Chip tone="amber" live>btc {group(wallet.tipHeight)}</Chip>}
          </>
        }
      />

      <nav className="tabs" aria-label="Wallet sections">
        {WALLET_TABS.map((t) => (
          <a key={t.tab} href={`#${t.path}`} aria-current={t.tab === tab ? "page" : undefined}>
            {t.label}
          </a>
        ))}
      </nav>

      {tab === "overview" && <Overview vault={vault} />}
      {tab === "tokens" && <WalletTokens />}
      {tab === "activity" && <WalletActivity />}

      {wallet.error && <Notice tone="warn">{wallet.error}</Notice>}
    </div>
  );
}

function Overview({ vault }: { vault: Vault }) {
  const wallet = useWallet();
  const balance = wallet.balance;

  return (
    <div className="stack-lg">
      {vault.kind === "demo" && (
        <Notice tone="warn">
          This is the <b>shared demo wallet</b>. Its key is public: anyone can spend what is here, including coins you
          send to it. Use your own wallet for anything you want to keep.
        </Notice>
      )}

      <section className="split">
        <Panel
          eyebrow={KIND_EYEBROW[vault.kind]}
          title="Receive"
          aside={
            <button className="btn ghost" disabled={wallet.refreshing} onClick={() => void wallet.refresh()}>
              {wallet.refreshing ? "Refreshing…" : "Refresh"}
            </button>
          }
        >
          <div className="receive">
            <QrCode value={vault.address} label={`QR code of the address ${vault.address}`} />
            <div className="stack-sm grow">
              <p className="clamp">Send {NETWORK.label} coins to this address. This is the whole address — check it before you send.</p>
              <Copyable value={vault.address} label="address" />
              <TxLink kind="address" id={vault.address} className="tiny">
                Inspect on mempool.space ↗
              </TxLink>
            </div>
          </div>

          <div className="rule" />

          <div className="scoreboard">
            <Stat k="balance" v={balance ? formatBtc(balance.total) : "—"} unit="tBTC" tone="amber" />
            <Stat
              k="confirmed"
              v={balance ? formatBtc(balance.total - balance.pending) : "—"}
              small
              hint="In a block: safe to spend"
            />
            <Stat
              k="unconfirmed"
              v={balance ? formatBtc(balance.pending) : "—"}
              small
              hint="In the mempool: spendable at your own risk"
            />
          </div>
        </Panel>

        <div className="stack-md">
          <TokenSummary />
          <Panel eyebrow="fund" title="Get testnet coins">
            <p className="clamp">Testnet coins are free play money. Paste your address into a faucet.</p>
            <div className="row wrapped">
              {NETWORK.faucets.map((faucet) => (
                <ExternalLink key={faucet.url} className="btn sm" href={faucet.url}>
                  {faucet.name} ↗
                </ExternalLink>
              ))}
            </div>
            <More>
              <p>The balance updates by itself within a few seconds of the transaction reaching the mempool.</p>
            </More>
          </Panel>
        </div>
      </section>

      <KeysPanel vault={vault} />
    </div>
  );
}

/** How many tokens, and the largest few — the rest is one tab away. */
function TokenSummary() {
  const tokens = useTokens();
  const launchOf = useLaunchByToken();
  const positions = tokens.holdings ? positionsOf(tokens.holdings) : null;

  return (
    <Panel
      eyebrow="tokens"
      title={positions ? `${group(positions.length)} held` : "Tokens"}
      aside={<a className="btn ghost sm" href="#/wallet/tokens">All tokens →</a>}
    >
      {positions === null ? (
        <p className="faint clamp">Reading the cells sealed to your address…</p>
      ) : positions.length === 0 ? (
        <p className="clamp">
          No tokens yet. <a href="#/">Pick a launch</a> and mine.
        </p>
      ) : (
        <ul className="holdlist">
          {positions.slice(0, TOP_HOLDINGS).map(({ tokenId, total }) => {
            const launch = launchOf(tokenId);
            return (
              <li key={tokenId}>
                {launch && <TokenImage art={launch.art} seed={launch.id} accent={launch.accent} symbol={launch.symbol} size="sm" />}
                <span className="sym">{launch?.symbol ?? "unknown token"}</span>
                <span className="spacer" />
                <span className="mono">{atoms(total, DECIMALS, 2)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
