import { useEffect, useState } from "react";
import { Launches } from "./views/Launches";
import { LaunchView } from "./views/Launch";
import { Lab } from "./views/Lab";
import { ProofView } from "./views/Proof";
import { Holdings } from "./views/Holdings";
import { WalletView } from "./views/Wallet";
import { Market } from "./views/Market";
import { NETWORK, WalletProvider, formatBtc, shortAddress, useWallet } from "./state/WalletProvider";
import { group } from "./lib/format";
import { Chip } from "./ui/primitives";

type Route =
  | { name: "launches" }
  | { name: "launch"; id: string }
  | { name: "proof"; id: string }
  | { name: "lab" }
  | { name: "holdings" }
  | { name: "market"; id?: string }
  | { name: "wallet" };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (path[0] === "launch" && path[1]) {
    return path[2] === "proof" ? { name: "proof", id: path[1] } : { name: "launch", id: path[1] };
  }
  if (path[0] === "lab") return { name: "lab" };
  if (path[0] === "holdings") return { name: "holdings" };
  if (path[0] === "market") return { name: "market", id: path[1] };
  if (path[0] === "wallet") return { name: "wallet" };
  return { name: "launches" };
}

export function navigate(to: string): void {
  window.location.hash = to;
}

export default function App() {
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  );
}

function Shell() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const tab = route.name === "launch" || route.name === "proof" ? "launches" : route.name;

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true">
            {/* Drawn rather than typed: the ₿ glyph is missing from many
                default font stacks and silently degrades to "B". */}
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
              <path
                d="M8.5 3.5v17M13 3.5v17M5 7h8.2a3.4 3.4 0 0 1 0 6.8H5M5 13.8h9a3.4 3.4 0 0 1 0 6.8H5M5 7v13.6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          btc<em>.</em>fun
        </a>

        <nav className="nav">
          <button aria-current={tab === "launches" ? "page" : undefined} onClick={() => navigate("/")}>
            Launches
          </button>
          <button aria-current={tab === "lab" ? "page" : undefined} onClick={() => navigate("/lab")}>
            Emission lab
          </button>
          <button aria-current={tab === "market" ? "page" : undefined} onClick={() => navigate("/market")}>
            Market
          </button>
          <button aria-current={tab === "holdings" ? "page" : undefined} onClick={() => navigate("/holdings")}>
            Holdings
          </button>
        </nav>

        <div className="topbar-right">
          <TipChip />
          <WalletPill active={tab === "wallet"} />
        </div>
      </header>

      <main className="main">
        <div className="wrap">
          {route.name === "launches" && <Launches />}
          {route.name === "launch" && <LaunchView id={route.id} />}
          {route.name === "proof" && <ProofView id={route.id} />}
          {route.name === "lab" && <Lab />}
          {route.name === "holdings" && <Holdings />}
          {route.name === "market" && <Market launchId={route.id} />}
          {route.name === "wallet" && <WalletView />}
        </div>
      </main>

      <footer className="footer">
        <div className="wrap row wrapped" style={{ gap: 14 }}>
          <span>
            Prototype on {NETWORK.label}. Tickets and balances are real; token
            settlement is not on chain yet.
          </span>
          <span className="spacer" />
          <a href="https://meshkore.com/standard">MeshKore standard</a>
          <span className="faint">·</span>
          <span className="faint">PROTOCOL.md is canonical</span>
        </div>
      </footer>
    </div>
  );
}

/** The chain tip, which is the clock the emission schedule runs on (§6). */
function TipChip() {
  const { tipHeight } = useWallet();
  return tipHeight ? (
    <Chip tone="cyan" live title={`${NETWORK.label} chain tip`}>
      <span className="mono">btc {group(tipHeight)}</span>
    </Chip>
  ) : (
    <Chip title="Waiting for the chain tip">
      <span className="mono">btc …</span>
    </Chip>
  );
}

function WalletPill({ active }: { active: boolean }) {
  const { vault, balance } = useWallet();

  if (!vault) {
    return (
      <button className="btn" onClick={() => navigate("/wallet")}>
        Connect wallet
      </button>
    );
  }

  return (
    <button
      className="walletpill"
      aria-current={active ? "page" : undefined}
      onClick={() => navigate("/wallet")}
      title={vault.address}
    >
      <span className="addr">{shortAddress(vault.address)}</span>
      <span className="bal">{balance ? formatBtc(balance.total) : "…"}</span>
    </button>
  );
}
