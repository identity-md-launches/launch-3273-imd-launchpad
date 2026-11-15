import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { ETH_CHAIN_ID, type Cluster } from "../config";
import { etherscanAddr, etherscanTx, fmtUnits, short, solscanAccount, solscanTx } from "../lib/format";
import { useStored, type TxRecord } from "../lib/store";
import { iconSrc } from "./icons";
import { NAMED_ETH, OPEN_IN, isMobileBrowser } from "./eth";
import { SOL_WALLETS, useSolana } from "./solana";

type Focus = "all" | "ethereum" | "solana";
const Ctx = createContext<{ open(f?: Focus): void }>({ open: () => {} });
export const useWalletSheet = () => useContext(Ctx);

const chainName = (id?: number) => (id === 1 ? "Ethereum Mainnet" : id === 11155111 ? "Sepolia" : id ? `Chain ${id}` : "Unknown network");

export function WalletRoot({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  return (
    <Ctx.Provider value={{ open: (f = "all") => setFocus(f) }}>
      {children}
      {focus && <Sheet focus={focus} onClose={() => setFocus(null)} />}
    </Ctx.Provider>
  );
}

/** The one wallet control in the header: chain dots show which sides are connected. */
export function WalletButton() {
  const { open } = useWalletSheet();
  const { address: eth } = useAccount();
  const { address: sol } = useSolana();
  const label = eth && sol ? "2 wallets" : eth ? short(eth) : sol ? short(sol) : "Connect";
  return (
    <button type="button" className={`button ${eth || sol ? "" : "button-primary"} button-small`} onClick={() => open()} aria-haspopup="dialog">
      {eth && <span className="chain-dot chain-eth" aria-hidden="true" />}
      {sol && <span className="chain-dot chain-sol" aria-hidden="true" />}
      <span className="num">{label}</span>
    </button>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Sheet({ focus, onClose }: { focus: Focus; onClose(): void }) {
  const bg = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  // Read during the first render, before autoFocus moves focus to Close.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  // Modal: the page behind is inert, Tab cycles inside the dialog, and focus returns to the opener on close.
  useEffect(() => {
    const others = Array.from(bg.current?.parentElement?.children ?? []).filter((el): el is HTMLElement => el !== bg.current && el instanceof HTMLElement && !el.hasAttribute("inert"));
    others.forEach((el) => el.setAttribute("inert", ""));
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1], at = document.activeElement;
      if (!box.current.contains(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener("keydown", k);
    return () => {
      removeEventListener("keydown", k);
      others.forEach((el) => el.removeAttribute("inert"));
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
  return (
    <div className="sheet-bg" ref={bg} onClick={onClose}>
      <div className="sheet sheet-wallets" ref={box} role="dialog" aria-modal="true" aria-labelledby="ws-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="ws-title">Wallets</h2>
          <button type="button" className="x" aria-label="Close" onClick={onClose} autoFocus>×</button>
        </div>
        <p className="hint">Connect Ethereum and Solana separately. The site never asks for a seed phrase or private key.</p>
        {focus !== "solana" && <EthGroup />}
        {focus !== "ethereum" && <SolGroup />}
        <History />
      </div>
    </div>
  );
}

function Row({ icon, name, tag, onClick, href, disabled }: { icon?: string; name: string; tag?: string; onClick?(): void; href?: string; disabled?: boolean }) {
  const inner = (
    <>
      {icon ? <img className="ic" src={icon} width={28} height={28} alt="" /> : <span className="ic thumb-empty" aria-hidden="true" />}
      <span className="row-name">{name}</span>
      {tag && <span className="row-tag">{tag}</span>}
    </>
  );
  return href ? <a className="sheet-row" href={href} target="_blank" rel="noreferrer">{inner}</a> : <button type="button" className="sheet-row" onClick={onClick} disabled={disabled}>{inner}</button>;
}

function EthGroup() {
  const mobile = isMobileBrowser();
  const { address, chainId, connector, isConnected } = useAccount();
  const { connectors, connect, isPending, variables, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const bal = useBalance({ address, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")].filter((c) => !(c.id === "injected" && named));
  const label = (c: Connector) => (c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name);
  const missing = NAMED_ETH.filter((w) => !connectors.some((c) => w.rdns.includes(c.id)));
  const declined = error && /reject|denied/i.test(error.message);
  return (
    <section className="wallet-group" aria-labelledby="wg-eth">
      <h3 id="wg-eth"><span className="chain-dot chain-eth" aria-hidden="true" /> Ethereum <span className="muted">MetaMask, Rabby</span></h3>
      {isConnected && address ? (
        <div className="account">
          <div className="account-head">
            {connector?.icon && <img className="ic" src={connector.icon} width={28} height={28} alt="" />}
            <strong className="num">{short(address)}</strong>
            <a href={etherscanAddr(address)} target="_blank" rel="noreferrer" className="hint">Etherscan</a>
          </div>
          <p className="hint num">{connector?.name ?? "Wallet"} · {chainName(chainId)} · {bal.data ? `${fmtUnits(bal.data.value, 18, 5)} ETH` : "…"}</p>
          <div className="actions">
            {chainId !== ETH_CHAIN_ID && <button type="button" className="button button-primary button-small" disabled={switching} onClick={() => switchChain({ chainId: ETH_CHAIN_ID })}>Switch to Ethereum Mainnet</button>}
            <button type="button" className="button button-small" onClick={() => disconnect()}>Disconnect</button>
          </div>
        </div>
      ) : (
        <>
          {mobile && OPEN_IN.filter((w) => w.chain === "ethereum").map((w) => <Row key={w.id} icon={iconSrc(w.id)} name={`Open in ${w.name}`} href={w.href(location.href)} />)}
          {listed.filter((c) => !mobile || c.type !== "injected").map((c) => (
            <Row key={c.uid} icon={c.icon ?? iconSrc(c.id)} name={label(c)} tag={isPending && variables?.connector === c ? "opening…" : undefined} disabled={isPending} onClick={() => connect({ connector: c, chainId: ETH_CHAIN_ID })} />
          ))}
          {!mobile && missing.map((w) => <Row key={w.id} icon={iconSrc(w.id)} name={w.name} tag="Install" href={w.install} />)}
          {error && <p className="error">{declined ? "You declined in your wallet." : error.message.split("\n")[0]}</p>}
        </>
      )}
    </section>
  );
}

function SolGroup() {
  const mobile = isMobileBrowser();
  const { address, wallet, cluster, setCluster, connection, connect, disconnect, pending, error } = useSolana();
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => {
    if (!address) return;
    let live = true; setBal(null);
    import("@solana/web3.js").then(({ PublicKey }) => connection.getBalance(new PublicKey(address))).then((b) => live && setBal(b)).catch(() => live && setBal(-1));
    return () => { live = false; };
  }, [address, connection]);
  return (
    <section className="wallet-group" aria-labelledby="wg-sol">
      <h3 id="wg-sol"><span className="chain-dot chain-sol" aria-hidden="true" /> Solana <span className="muted">Phantom, Solflare</span></h3>
      {address ? (
        <div className="account">
          <div className="account-head">
            <img className="ic" src={iconSrc(wallet!)} width={28} height={28} alt="" />
            <strong className="num">{short(address)}</strong>
            <a href={solscanAccount(address, cluster)} target="_blank" rel="noreferrer" className="hint">Solscan</a>
          </div>
          <p className="hint num">{wallet === "phantom" ? "Phantom" : "Solflare"} · Solana {cluster} · {bal == null ? "…" : bal < 0 ? "balance unavailable" : `${fmtUnits(BigInt(bal), 9, 4)} SOL`}</p>
          <div className="segmented" role="group" aria-label="Solana network for launches">
            {(["devnet", "mainnet"] as Cluster[]).map((c) => <button key={c} type="button" aria-pressed={cluster === c} onClick={() => setCluster(c)}>{c === "devnet" ? "Devnet (test)" : "Mainnet"}</button>)}
          </div>
          <p className="hint">Launches use the network chosen here. Swaps always use mainnet. Match the network in your wallet too.</p>
          <div className="actions"><button type="button" className="button button-small" onClick={() => disconnect()}>Disconnect</button></div>
        </div>
      ) : (
        <>
          {mobile && OPEN_IN.filter((w) => w.chain === "solana").map((w) => <Row key={w.id} icon={iconSrc(w.id)} name={`Open in ${w.name}`} href={w.href(location.href)} />)}
          {!mobile && SOL_WALLETS.map((w) => w.get()
            ? <Row key={w.id} icon={iconSrc(w.id)} name={w.name} tag={pending === w.id ? "opening…" : undefined} disabled={!!pending} onClick={() => connect(w.id)} />
            : <Row key={w.id} icon={iconSrc(w.id)} name={w.name} tag="Install" href={w.install} />)}
          {error && <p className="error">{error}</p>}
        </>
      )}
    </section>
  );
}

function History() {
  const [list] = useStored<TxRecord[]>("tx-history", []);
  if (!list.length) return null;
  return (
    <section className="wallet-group" aria-labelledby="wg-hist">
      <h3 id="wg-hist">Recent transactions <span className="muted">from this site, on this device</span></h3>
      <ul className="activity">
        {list.slice(0, 8).map((t) => (
          <li key={t.id}>
            <span className="truncate">{t.label}</span>
            <a className={`num state-${t.status === "confirmed" ? "completed" : t.status === "failed" ? "blocked" : "executing"}`} href={t.chain === "ethereum" ? etherscanTx(t.id) : solscanTx(t.id, t.cluster)} target="_blank" rel="noreferrer">{t.status}</a>
          </li>
        ))}
      </ul>
      <a className="hint" href="#/portfolio">Full history in Portfolio</a>
    </section>
  );
}
