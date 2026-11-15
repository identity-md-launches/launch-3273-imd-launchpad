import { useEffect, useState } from "react";
import { bindNote } from "./lib/store";
import { useRoute } from "./lib/route";
import { Discover } from "./pages/Discover";
import { Home } from "./pages/Home";
import { Pimd, Portfolio, Rewards, Studio, SwarmPage, TokenPage } from "./pages/Other";
import { Swap } from "./pages/Swap";
import { useSolana } from "./wallet/solana";
import { WalletButton } from "./wallet/WalletSheet";

const NAV: [string, string][] = [["", "Launch"], ["swap", "Swap"], ["swarm", "Swarm"], ["discover", "Discover"], ["studio", "Studio"], ["portfolio", "Portfolio"], ["pimd", "PIMD"], ["rewards", "Revenue"]];

export function App() {
  const { parts } = useRoute();
  const { cluster } = useSolana();
  const [note, setNote] = useState<{ text: string; href?: string } | null>(null);
  useEffect(() => { bindNote(setNote); }, []);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 8000); return () => clearTimeout(t); } }, [note]);
  const [p0, p1] = parts;
  let page;
  switch (p0) {
    case "swap": page = <Swap />; break;
    case "swarm": page = <SwarmPage />; break;
    case "discover": page = <Discover />; break;
    case "token": page = p1 ? <TokenPage key={p1} mint={p1} /> : <Discover />; break;
    case "studio": page = <Studio key={p1} mint={p1} />; break;
    case "portfolio": page = <Portfolio />; break;
    case "creator": page = <Portfolio key={p1} creator={p1} />; break;
    case "pimd": page = <Pimd />; break;
    case "rewards": page = <Rewards />; break;
    default: page = <Home />;
  }
  const current = p0 === "token" ? "discover" : p0 === "creator" ? "portfolio" : p0 ?? "";
  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="header">
        <div className="wrap">
          <div className="header-row">
            <a className="brand" href="#/"><img src="./favicon.svg" width={28} height={28} alt="" /><span>IMD Launchpad</span></a>
            <div className="header-actions">
              <a className="button button-small hide-xs" href="#/swarm">Build with IMD Swarm</a>
              <WalletButton />
            </div>
          </div>
          <nav className="nav" aria-label="Main">
            {NAV.map(([k, l]) => <a key={k} href={`#/${k}`} aria-current={current === k ? "page" : undefined}>{l}</a>)}
          </nav>
        </div>
      </header>
      {cluster === "mainnet" && <div className="banner" role="note"><div className="wrap">Mainnet: launches and trades use real SOL.</div></div>}
      <main id="main" tabIndex={-1}>{page}</main>
      <footer className="footer">
        <div className="wrap footer-row">
          <p>IMD Launchpad. Idea in. Ecosystem out.</p>
          <p className="muted">Non-custodial. Every transaction is signed in your own wallet; the site never asks for a seed phrase.</p>
          <p className="muted">Tokens launch on Raydium LaunchLab. Swaps route through KyberSwap, Jupiter and LI.FI. Swarm runs on <a href="https://imd.fun" target="_blank" rel="noreferrer">IMD</a>.</p>
        </div>
      </footer>
      <div className="toast" role="status" aria-live="polite">{note && <>{note.text} {note.href && <a href={note.href}>Open</a>}</>}</div>
    </>
  );
}
