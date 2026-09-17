import { lazy, Suspense, useEffect, useState } from "react";
import { Launches } from "./views/Launches";
import { LaunchView } from "./views/Launch";
import { NETWORK, WalletProvider, formatBtc, shortAddress, useWallet } from "./state/WalletProvider";
import { LaunchesProvider } from "./state/LaunchesProvider";
import { TokensProvider } from "./state/TokensProvider";
import { group } from "./lib/format";
import { PixelBursts } from "./ui/PixelBursts";
import { BitcoinMark } from "./ui/PixelIcon";
import { Chip } from "./ui/primitives";

// Sections a visitor may never open load on demand; the front page and a
// launch page, where nearly everyone starts, ship with the first chunk.
const Lab = lazy(() => import("./views/Lab").then((m) => ({ default: m.Lab })));
const ProofView = lazy(() => import("./views/Proof").then((m) => ({ default: m.ProofView })));
const Holdings = lazy(() => import("./views/Holdings").then((m) => ({ default: m.Holdings })));
const WalletView = lazy(() => import("./views/Wallet").then((m) => ({ default: m.WalletView })));
const Market = lazy(() => import("./views/Market").then((m) => ({ default: m.Market })));
const Activity = lazy(() => import("./views/Activity").then((m) => ({ default: m.Activity })));
const Create = lazy(() => import("./views/Create").then((m) => ({ default: m.Create })));
const Docs = lazy(() => import("./views/Docs").then((m) => ({ default: m.Docs })));

type Route =
  | { name: "launches" }
  /** `mine` when arrived at from a MINE button: the page opens on the miner. */
  | { name: "launch"; id: string; mine: boolean }
  | { name: "proof"; txid?: string }
  | { name: "lab" }
  | { name: "create" }
  | { name: "holdings" }
  | { name: "market" }
  | { name: "activity" }
  | { name: "wallet" }
  | { name: "docs"; page?: string };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (path[0] === "launch" && path[1]) return { name: "launch", id: path[1], mine: path[2] === "mine" };
  if (path[0] === "proof") return { name: "proof", txid: path[1] };
  if (path[0] === "lab") return { name: "lab" };
  if (path[0] === "create") return { name: "create" };
  if (path[0] === "activity") return { name: "activity" };
  if (path[0] === "holdings") return { name: "holdings" };
  if (path[0] === "market") return { name: "market" };
  if (path[0] === "wallet") return { name: "wallet" };
  if (path[0] === "docs") return { name: "docs", page: path[1] };
  return { name: "launches" };
}

/**
 * The four things you can do, in the order you would do them.
 *
 * Real links rather than buttons: a section is a place, so it has to open in a
 * new tab, be copied, bookmarked and middle-clicked like any other place.
 */
const SECTIONS = [
  { tab: "launches", path: "/", label: "Launches" },
  { tab: "create", path: "/create", label: "Create" },
  { tab: "market", path: "/market", label: "Market" },
  { tab: "activity", path: "/activity", label: "Activity" },
] as const;

export function navigate(to: string): void {
  window.location.hash = to;
}

export default function App() {
  return (
    <WalletProvider>
      <LaunchesProvider>
        <TokensProvider>
          <Shell />
        </TokensProvider>
      </LaunchesProvider>
    </WalletProvider>
  );
}

function Shell() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  // Every arrival is a fresh page: following a link to the section you are
  // already in (Create after announcing, say) must not show its old state.
  const [visit, setVisit] = useState(0);

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash));
      setVisit((v) => v + 1);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Detail pages belong to the section they were reached from, so the nav
  // never goes blank halfway through a flow.
  const tab = route.name === "launch" ? "launches" : route.name;

  return (
    <div className="shell">
      <PixelBursts />
      <header className="topbar">
        <a className="brand" href="#/" aria-label="btc.fun, all launches">
          <span className="brand-mark" aria-hidden="true">
            <BitcoinMark />
          </span>
          <span className="word">
            btc<em>.</em>fun
          </span>
        </a>

        {/* Four things you can do, on the left. What you own, on the right. */}
        <nav className="nav">
          {SECTIONS.map((section) => (
            <a
              key={section.tab}
              href={`#${section.path}`}
              aria-current={tab === section.tab ? "page" : undefined}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="topbar-right rail">
          <TipChip />
          <span className="divider" />
          <HoldingsPill active={tab === "holdings"} />
          <WalletPill active={tab === "wallet"} />
        </div>
      </header>

      <main className="main">
        <div className="wrap" key={visit}>
          <Suspense fallback={<p className="faint">Loading…</p>}>
          {route.name === "launches" && <Launches />}
          {route.name === "launch" && <LaunchView id={route.id} focusMiner={route.mine} />}
          {route.name === "proof" && <ProofView txid={route.txid} />}
          {route.name === "lab" && <Lab />}
          {route.name === "create" && <Create />}
          {route.name === "activity" && <Activity />}
          {route.name === "holdings" && <Holdings />}
          {route.name === "market" && <Market />}
          {route.name === "wallet" && <WalletView />}
          {route.name === "docs" && <Docs slug={route.page} />}
          </Suspense>
        </div>
      </main>

      <footer className="footer">
        <div className="wrap row wrapped">
          <span>
            Testnet: every ticket, mint and sale is a real RGB++ transaction on {NETWORK.label} and CKB testnet.
          </span>
          <span className="spacer" />
          <a href="#/proof">Verify a mint</a>
          <span className="faint">·</span>
          <a href="#/docs">Docs</a>
          <span className="faint">·</span>
          <a href="#/lab">The standard</a>
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

/** Holdings sits beside the wallet because it *is* the wallet's contents —
 *  grouping it with the navigation implied it was another place to browse. */
function HoldingsPill({ active }: { active: boolean }) {
  const { vault } = useWallet();
  if (!vault) return null;
  return (
    <button
      className="btn ghost holdings"
      aria-current={active ? "page" : undefined}
      onClick={() => navigate("/holdings")}
    >
      Holdings
    </button>
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
