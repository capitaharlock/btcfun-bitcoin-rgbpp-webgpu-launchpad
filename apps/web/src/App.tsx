/* The shell: providers, the top bar, the footer and the page the route names.
 *
 * Routing itself lives in `lib/router.ts` and `hooks/useRoute.ts`, so the
 * views depend on the router and never on the shell that renders them.
 */

import { lazy, Suspense } from "react";
import { Launches } from "./views/Launches";
import { LaunchView } from "./views/Launch";
import { NETWORK, WalletProvider, useWallet } from "./state/WalletProvider";
import { LaunchesProvider } from "./state/LaunchesProvider";
import { TokensProvider } from "./state/TokensProvider";
import { group } from "./lib/format";
import { PixelBursts } from "./ui/PixelBursts";
import { BitcoinMark } from "./ui/PixelIcon";
import { Chip } from "./ui/primitives";
import { DemoBadge } from "./components/wallet/DemoBadge";
import { WalletPill } from "./components/wallet/WalletPill";
import { useRoute } from "./hooks/useRoute";

// Sections a visitor may never open load on demand; the front page and a
// launch page, where nearly everyone starts, ship with the first chunk.
const Lab = lazy(() => import("./views/Lab").then((m) => ({ default: m.Lab })));
const ProofView = lazy(() => import("./views/Proof").then((m) => ({ default: m.ProofView })));
const WalletView = lazy(() => import("./views/Wallet").then((m) => ({ default: m.WalletView })));
const Market = lazy(() => import("./views/Market").then((m) => ({ default: m.Market })));
const Activity = lazy(() => import("./views/Activity").then((m) => ({ default: m.Activity })));
const Create = lazy(() => import("./views/create").then((m) => ({ default: m.Create })));
const Docs = lazy(() => import("./views/Docs").then((m) => ({ default: m.Docs })));

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
  const { route, visit } = useRoute();

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
          <DemoBadge />
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
          {route.name === "market" && <Market />}
          {route.name === "wallet" && <WalletView tab={route.tab} />}
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
