import { useEffect, useState } from "react";
import { Launches } from "./views/Launches";
import { LaunchView } from "./views/Launch";
import { Lab } from "./views/Lab";
import { ProofView } from "./views/Proof";
import { Holdings } from "./views/Holdings";
import { CURRENT_HEIGHT } from "./data/launches";
import { Chip } from "./ui/primitives";

type Route =
  | { name: "launches" }
  | { name: "launch"; id: string }
  | { name: "proof"; id: string }
  | { name: "lab" }
  | { name: "holdings" };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (path[0] === "launch" && path[1]) {
    return path[2] === "proof" ? { name: "proof", id: path[1] } : { name: "launch", id: path[1] };
  }
  if (path[0] === "lab") return { name: "lab" };
  if (path[0] === "holdings") return { name: "holdings" };
  return { name: "launches" };
}

export function navigate(to: string): void {
  window.location.hash = to;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const tab =
    route.name === "launch" || route.name === "proof" ? "launches" : route.name;

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
          <button aria-current={tab === "holdings" ? "page" : undefined} onClick={() => navigate("/holdings")}>
            Holdings
          </button>
        </nav>

        <div className="topbar-right">
          <Chip tone="cyan" live>
            <span className="mono">btc {CURRENT_HEIGHT.toLocaleString("en-US")}</span>
          </Chip>
          <Chip tone="warn">fixtures</Chip>
        </div>
      </header>

      <main className="main">
        <div className="wrap">
          {route.name === "launches" && <Launches />}
          {route.name === "launch" && <LaunchView id={route.id} />}
          {route.name === "proof" && <ProofView id={route.id} />}
          {route.name === "lab" && <Lab />}
          {route.name === "holdings" && <Holdings />}
        </div>
      </main>

      <footer className="footer">
        <div className="wrap row wrapped" style={{ gap: 14 }}>
          <span>
            Specification-stage prototype. No chain connection, no economic model adopted.
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
