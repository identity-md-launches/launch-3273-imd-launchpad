import { useEffect, useState, type FormEvent } from "react";
import { useAccount, useReadContract } from "wagmi";
import { JobsBoard, ServicePicker, SwarmCheckout, SwarmStats } from "../components/Swarm";
import { ETH_CHAIN_ID, IMD_TOKEN, OWNER, type Cluster } from "../config";
import { compact, declined, errMsg, etherscanAddr, etherscanTx, fmtUnits, pct, short, solscanAccount, solscanToken, solscanTx, toUnits, usd } from "../lib/format";
import { readPool, trade, type PoolState } from "../lib/launchlab";
import { tokenPairs, type Pair } from "../lib/market";
import { useRoute } from "../lib/route";
import { logTx, notify, useStored, type Launched, type SwarmOrder, type TxRecord } from "../lib/store";
import { ERC20 } from "../wallet/eth";
import { useSolana } from "../wallet/solana";
import { useWalletSheet } from "../wallet/WalletSheet";

export function SwarmPage() {
  const { query } = useRoute();
  const [launched] = useStored<Launched[]>("launched", []);
  const mint = query.get("mint") ?? "";
  const known = launched.find((l) => l.mint === mint);
  const [services, setServices] = useState<string[]>(query.get("parent") ? ["website"] : ["website"]);
  const [idea, setIdea] = useState(known?.description ?? "");
  const [parent, setParent] = useState(query.get("parent") ?? "");
  const [repo, setRepo] = useState("");
  const token = known ? { name: known.name, symbol: known.symbol, mint: known.mint } : undefined;
  return (
    <>
      <section className="wrap section" aria-labelledby="sw-title">
        <h1 id="sw-title" className="page-title">Build with IMD Swarm</h1>
        <p className="lede">IMD's AI workers build websites, contracts, NFTs, audits, art, audio, video and launch content for 0.5 IMD a job.</p>
        <div className="token-grid">
          <div className="card stack">
            {token && <p className="hint">For {token.name} ({token.symbol}).</p>}
            <ServicePicker value={services} onChange={setServices} />
            <div className="field"><label htmlFor="sw-idea">Describe the project</label><textarea id="sw-idea" rows={4} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="A cat-themed community token for harbour towns, playful and warm, with a site that explains how to buy." /></div>
            {services.includes("audit") && <div className="field"><label htmlFor="sw-repo">Repository to audit</label><input id="sw-repo" value={repo} onChange={(e) => setRepo(e.target.value.trim())} placeholder="https://github.com/…" inputMode="url" /></div>}
            <div className="field"><label htmlFor="sw-parent">Continue an earlier job (optional)</label><input id="sw-parent" value={parent} onChange={(e) => setParent(e.target.value.trim())} placeholder="Job ID of the version to build on" autoComplete="off" /></div>
          </div>
          <div className="card"><h2>Pay and start</h2><SwarmCheckout serviceIds={services} idea={idea} token={token} repo={repo} parent={parent || undefined} /></div>
        </div>
      </section>
      <section className="wrap section" aria-labelledby="jobs2"><h2 id="jobs2">Your Swarm jobs</h2><JobsBoard /></section>
      <section className="wrap section"><SwarmStats /></section>
    </>
  );
}

function useLaunched(mint: string) { const [l] = useStored<Launched[]>("launched", []); return l.find((x) => x.mint === mint); }

export function TokenPage({ mint }: { mint: string }) {
  const local = useLaunched(mint);
  const { cluster: walletCluster, provider, address } = useSolana();
  const cluster: Cluster = local?.cluster ?? "mainnet";
  const { open } = useWalletSheet();
  const [pair, setPair] = useState<Pair | null | undefined>(undefined);
  const [pool, setPool] = useState<PoolState | null | undefined>(undefined);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  const [watch, setWatch] = useStored<string[]>("watchlist", []);
  const [comments, setComments] = useStored<{ by: string; text: string; at: number }[]>(`comments:${mint}`, []);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (cluster === "mainnet") tokenPairs([mint]).then((p) => setPair(p[0] ?? null)).catch(() => setPair(null)); else setPair(null);
    readPool(cluster, mint).then(setPool).catch(() => setPool(null));
  }, [mint, cluster]);
  const name = pair?.baseToken.name ?? local?.name ?? "Token";
  const sym = pair?.baseToken.symbol ?? local?.symbol ?? "";
  const onCurve = pool && !pool.graduated;
  const on = watch.includes(mint);

  async function doTrade(e: FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!provider || !address) return open("solana");
    if (walletCluster !== cluster) return setMsg({ ok: false, text: `This token is on Solana ${cluster}. Switch the network in Wallets first.` });
    const v = toUnits(amt, side === "buy" ? 9 : 6);
    if (!v || v <= 0n) return setMsg({ ok: false, text: side === "buy" ? "Enter an amount of SOL." : `Enter an amount of ${sym}.` });
    setBusy(true);
    try {
      const sig = await trade(cluster, provider, mint, side, v);
      logTx({ id: sig, chain: "solana", cluster, kind: side, label: `${side === "buy" ? "Buy" : "Sell"} ${sym}`, status: "confirmed", account: address });
      setMsg({ ok: true, text: "Confirmed on Solana.", href: solscanTx(sig, cluster) }); notify(`${side === "buy" ? "Bought" : "Sold"} ${sym}.`);
      readPool(cluster, mint).then(setPool).catch(() => {});
    } catch (er) { const m = errMsg(er); setMsg({ ok: false, text: declined(m) ? "You declined in your wallet." : `The trade didn't go through: ${m}` }); }
    finally { setBusy(false); }
  }
  if (pair === undefined && pool === undefined) return <section className="wrap section"><p className="muted">Loading token…</p></section>;
  if (!pair && !pool && !local) return <section className="wrap section"><h1 className="page-title">Token not found</h1><p className="muted">No market or LaunchLab curve was found for this mint on Solana {cluster}.</p><a href="#/discover">Search tokens</a></section>;
  return (
    <section className="wrap section" aria-labelledby="tok-title">
      <div className="token-head">
        {(pair?.info?.imageUrl || local?.image) ? <img className="thumb thumb-lg" src={pair?.info?.imageUrl || local?.image} alt="" width={56} height={56} /> : <span className="thumb thumb-lg thumb-empty" />}
        <div className="token-title"><h1 id="tok-title" className="page-title">{name} <span className="muted">{sym}</span></h1><a className="mono-wrap num" href={solscanToken(mint, cluster)} target="_blank" rel="noreferrer">{mint}</a></div>
        <div className="actions">
          <button type="button" className="button button-small" aria-pressed={on} onClick={() => setWatch((w) => (on ? w.filter((x) => x !== mint) : [mint, ...w]))}>{on ? "★ Watching" : "☆ Watch"}</button>
          <a className="button button-small" href={`#/studio/${mint}`}>Studio</a>
        </div>
      </div>
      <div className="token-grid">
        <div className="stack">
          {pair ? <iframe className="chart-frame" title={`${sym} price chart`} src={`https://dexscreener.com/solana/${pair.pairAddress}?embed=1&theme=dark&trades=0&info=0`} loading="lazy" /> : <div className="card"><p className="muted">No chart yet. DexScreener lists a token after its first trades on mainnet.</p></div>}
          {pair && <dl className="stats card"><div><dt>Price</dt><dd className="num">{usd(Number(pair.priceUsd))}</dd></div><div><dt>24h</dt><dd className={`num ${(pair.priceChange?.h24 ?? 0) >= 0 ? "up" : "down"}`}>{pct(pair.priceChange?.h24)}</dd></div><div><dt>Market cap</dt><dd className="num">{compact(pair.marketCap ?? pair.fdv)}</dd></div><div><dt>Liquidity</dt><dd className="num">{compact(pair.liquidity?.usd)}</dd></div></dl>}
          {pair?.txns?.h24 && <div className="card"><h2>Live activity</h2><ul className="activity"><li><span>Buys, last hour</span><span className="num up">{pair.txns.h1?.buys ?? 0}</span></li><li><span>Sells, last hour</span><span className="num down">{pair.txns.h1?.sells ?? 0}</span></li><li><span>Buys, 24h</span><span className="num">{pair.txns.h24.buys}</span></li><li><span>Sells, 24h</span><span className="num">{pair.txns.h24.sells}</span></li><li><span>Volume, 24h</span><span className="num">{usd(pair.volume?.h24)}</span></li></ul></div>}
          <div className="card">
            <h2>Comments</h2>
            <p className="hint">Saved on this device only. The launchpad has no shared comment server yet.</p>
            <form className="comment-form" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setComments((c) => [{ by: address ?? "you", text: draft.trim().slice(0, 500), at: Date.now() }, ...c]); setDraft(""); } }}>
              <label htmlFor="c-new" className="visually-hidden">Write a comment</label><textarea id="c-new" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a note" /><button type="submit" className="button button-small">Post</button>
            </form>
            <ul className="comments">{comments.map((c) => <li key={c.at}><span className="muted num">{short(c.by)} · {new Date(c.at).toLocaleString()}</span><span>{c.text}</span></li>)}</ul>
          </div>
        </div>
        <div className="stack">
          <form className="card" onSubmit={doTrade}>
            <h2>Trade</h2>
            {onCurve ? (
              <>
                <div className="progress-block"><div className="field-head"><span>Bonding curve</span><span className="num">{(pool!.progress * 100).toFixed(1)}%</span></div><div className="progress"><span style={{ width: `${pool!.progress * 100}%` }} /></div><p className="hint num">{pool!.raisedSol.toFixed(2)} of {pool!.targetSol.toFixed(0)} SOL raised · {pool!.priceSol.toExponential(3)} SOL per token</p></div>
                <div className="segmented" role="group" aria-label="Side">{(["buy", "sell"] as const).map((s) => <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>{s === "buy" ? "Buy" : "Sell"}</button>)}</div>
                <div className="field"><label htmlFor="t-amt">{side === "buy" ? "SOL to spend" : `${sym} to sell`}</label><input id="t-amt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.0" /></div>
                <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Confirm in your wallet…" : address ? `${side === "buy" ? "Buy" : "Sell"} on LaunchLab` : "Connect Phantom or Solflare"}</button>
                <p className="hint">1% slippage limit. Raydium LaunchLab on Solana {cluster}.</p>
              </>
            ) : (
              <>
                <p className="muted">{pool?.graduated ? "Graduated: liquidity now sits in a Raydium pool." : "Not on a LaunchLab curve."} Trade it through Jupiter on the Swap page or on Raydium.</p>
                <div className="actions"><a className="button button-primary" href={`https://jup.ag/swap/SOL-${mint}`} target="_blank" rel="noreferrer">Trade on Jupiter</a><a className="button" href={`https://raydium.io/swap/?inputMint=sol&outputMint=${mint}`} target="_blank" rel="noreferrer">Raydium</a></div>
              </>
            )}
            {msg && <p className={msg.ok ? "hint" : "error"} role="status">{msg.text} {msg.href && <a href={msg.href} target="_blank" rel="noreferrer">Transaction</a>}</p>}
          </form>
          <div className="card"><h2>Build with Swarm</h2><p className="muted">Hire IMD Swarm for this token's website, art, content or contracts.</p><a className="button" href={`#/swarm?mint=${mint}`}>Build with IMD Swarm</a></div>
          {pool && <div className="card"><h2>Creator</h2><a className="mono-wrap" href={`#/creator/${pool.creator}`}>{pool.creator}</a></div>}
        </div>
      </div>
    </section>
  );
}

export function Studio({ mint }: { mint?: string }) {
  const [launched] = useStored<Launched[]>("launched", []);
  const [orders] = useStored<SwarmOrder[]>("swarm-orders", []);
  if (!mint) return (
    <section className="wrap section" aria-labelledby="st-title">
      <h1 id="st-title" className="page-title">Project studio</h1>
      <p className="muted">Every token launched from this device gets a Studio for its token, files, Swarm jobs, branding and ongoing work.</p>
      {launched.length ? <ul className="token-list">{launched.map((l) => <li key={l.mint} className="token-row"><a className="token-link" href={`#/studio/${l.mint}`}>{l.image ? <img className="thumb" src={l.image} alt="" width={40} height={40} /> : <span className="thumb thumb-empty" />}<span className="token-name"><strong>{l.name}</strong><span className="muted">{l.symbol} · {l.cluster} · {orders.filter((o) => o.mint === l.mint).length} jobs</span></span></a></li>)}</ul> : <p className="muted">No projects yet. <a href="#/">Launch a token</a> or <a href="#/swarm">hire Swarm without one</a>.</p>}
      <h2>Swarm jobs without a token</h2>
      <JobsBoard empty="None." mint={undefined} />
    </section>
  );
  const l = launched.find((x) => x.mint === mint);
  return (
    <section className="wrap section" aria-labelledby="st-title">
      <h1 id="st-title" className="page-title">Studio: {l ? `${l.name} (${l.symbol})` : short(mint)}</h1>
      <div className="token-grid">
        <div className="stack">
          <div className="card"><h2>Swarm jobs and deliverables</h2><JobsBoard mint={mint} empty="No jobs for this token yet." /></div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Token</h2>
            <dl className="facts"><div><dt>Mint</dt><dd className="mono-wrap">{mint}</dd></div>{l && <><div><dt>Network</dt><dd>Solana {l.cluster}</dd></div><div><dt>Launched</dt><dd>{new Date(l.at).toLocaleString()}</dd></div><div><dt>Creator</dt><dd className="mono-wrap">{l.creator}</dd></div></>}</dl>
            <div className="actions"><a className="button button-small" href={`#/token/${mint}`}>Token page</a>{l?.signatures[0] && <a className="button button-small button-quiet" href={solscanTx(l.signatures[0], l.cluster)} target="_blank" rel="noreferrer">Launch transaction</a>}</div>
          </div>
          <div className="card"><h2>Hire Swarm again</h2><p className="muted">Website, NFTs, contracts, audits, art, audio, video, marketing and more.</p><a className="button button-primary" href={`#/swarm?mint=${mint}`}>Build with IMD Swarm</a></div>
        </div>
      </div>
    </section>
  );
}

export function Portfolio({ creator }: { creator?: string }) {
  const { address: sol, connection, cluster } = useSolana();
  const { address: eth } = useAccount();
  const [txs] = useStored<TxRecord[]>("tx-history", []);
  const [launched] = useStored<Launched[]>("launched", []);
  const who = creator ?? sol;
  const [holdings, setHoldings] = useState<{ mint: string; amount: string }[] | null>(null);
  const imd = useReadContract({ address: IMD_TOKEN, abi: ERC20, functionName: "balanceOf", args: eth ? [eth] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!eth } });
  useEffect(() => {
    if (!who) return; setHoldings(null);
    import("@solana/web3.js").then(async ({ PublicKey }) => {
      const r = await connection.getParsedTokenAccountsByOwner(new PublicKey(who), { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGYPXbmMcCvdc3rBvFkuVpvT") });
      setHoldings(r.value.map((a) => ({ mint: a.account.data.parsed.info.mint, amount: a.account.data.parsed.info.tokenAmount.uiAmountString })).filter((h) => h.amount !== "0"));
    }).catch(() => setHoldings([]));
  }, [who, connection]);
  const mine = launched.filter((l) => l.creator === who);
  return (
    <section className="wrap section" aria-labelledby="pf-title">
      <h1 id="pf-title" className="page-title">{creator ? <>Creator <span className="num">{short(creator)}</span></> : "Portfolio"}</h1>
      {!who && !eth && <p className="muted">Connect a wallet to see holdings.</p>}
      <div className="token-grid">
        <div className="stack">
          {who && <div className="card"><h2>Solana tokens <span className="muted">({cluster})</span></h2>{holdings == null ? <p className="muted">Loading…</p> : holdings.length ? <ul className="holders">{holdings.map((h) => <li key={h.mint}><a className="mono-wrap" href={`#/token/${h.mint}`}>{short(h.mint, 6)}</a><span className="num">{h.amount}</span></li>)}</ul> : <p className="muted">No SPL tokens.</p>}<a className="hint" href={solscanAccount(who, cluster)} target="_blank" rel="noreferrer">Full account on Solscan</a></div>}
          {mine.length > 0 && <div className="card"><h2>Launched from this device</h2><ul className="link-list">{mine.map((l) => <li key={l.mint}><a href={`#/token/${l.mint}`}>{l.name} ({l.symbol})</a></li>)}</ul></div>}
        </div>
        <div className="stack">
          {eth && !creator && <div className="card"><h2>Ethereum</h2><p className="num">{fmtUnits(imd.data as bigint | undefined, 18)} IMD</p><a className="hint" href={etherscanAddr(eth)} target="_blank" rel="noreferrer">Full history on Etherscan</a></div>}
          {!creator && <div className="card"><h2>Transaction history</h2><p className="hint">Transactions sent from this site on this device.</p>{txs.length ? <ul className="activity">{txs.map((t) => <li key={t.id}><span>{t.label}<br /><span className="muted">{new Date(t.at).toLocaleString()}</span></span><a className="num" href={t.chain === "ethereum" ? etherscanTx(t.id) : solscanTx(t.id, t.cluster)} target="_blank" rel="noreferrer">{t.status}</a></li>)}</ul> : <p className="muted">None yet.</p>}</div>}
        </div>
      </div>
    </section>
  );
}

const PIMD_SPLIT = [
  { k: "publicLiquidity", label: "Public sale and liquidity", pct: 30, note: "Bonding curve, then the PIMD/SOL pool" },
  { k: "airdrops", label: "Airdrops", pct: 30, note: "IMD holders and launchpad users, by published snapshot" },
  { k: "development", label: "Development", pct: 20, note: "Vested on-chain" },
  { k: "marketing", label: "Marketing", pct: 10, note: "Vested on-chain" },
  { k: "developerTreasury", label: "Developer treasury", pct: 10, note: "Vested on-chain with a cliff" },
] as const;

function Split({ items, wallets, chain }: { items: readonly { k: string; label: string; pct: number; note: string }[]; wallets: Record<string, string>; chain: "eth" | "sol" }) {
  return (
    <>
      <div className="bar" role="img" aria-label={items.map((i) => `${i.label} ${i.pct}%`).join(", ")}>{items.map((i, n) => <span key={i.k} className={`bar-${n % 5}`} style={{ flex: i.pct }} />)}</div>
      <ul className="split-list">
        {items.map((i, n) => (
          <li key={i.k}><span className={`dot bar-${n % 5}`} aria-hidden="true" /><span><strong>{i.label}</strong><span className="muted">{i.note}</span>{wallets[i.k] ? <a className="mono-wrap" href={chain === "eth" ? etherscanAddr(wallets[i.k]) : solscanAccount(wallets[i.k])} target="_blank" rel="noreferrer">{wallets[i.k]}</a> : <span className="muted">Wallet not published yet</span>}</span><span className="num">{i.pct}%</span></li>
        ))}
      </ul>
    </>
  );
}

export function Pimd() {
  const deployed = !!OWNER.pimdMint;
  return (
    <section className="wrap section" aria-labelledby="pimd-title">
      <h1 id="pimd-title" className="page-title">Pump IMD (PIMD)</h1>
      <p className="lede">The launchpad's own Solana token. {deployed ? "Deployed." : "A proposal: it is not deployed."}</p>
      <div className="token-grid">
        <div className="card">
          <h2>Proposed distribution</h2>
          <Split items={PIMD_SPLIT} wallets={OWNER.pimdWallets} chain="sol" />
          <p className="hint">Every allocation wallet is published here before launch, and LaunchLab's locked, vesting allocation holds reserves on-chain without a hidden mint.</p>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Facts</h2>
            <dl className="facts"><div><dt>Name</dt><dd>Pump IMD</dd></div><div><dt>Ticker</dt><dd>PIMD</dd></div><div><dt>Supply</dt><dd className="num">1,000,000,000</dd></div><div><dt>Chain</dt><dd>Solana</dd></div><div><dt>Mint</dt><dd className="mono-wrap">{deployed ? <a href={solscanToken(OWNER.pimdMint)} target="_blank" rel="noreferrer">{OWNER.pimdMint}</a> : "Not deployed"}</dd></div></dl>
            {deployed ? <a className="button button-primary" href="#/swap?from=SOL&to=PIMD">Trade PIMD/SOL</a> : <p className="hint">Trading, airdrops and reserves open after an approved deployment publishes the mint and allocation wallets. Until then no PIMD exists, and none is sold here.</p>}
          </div>
          <div className="card"><h2>Utility</h2><ul className="bullets"><li>Trading pair PIMD/SOL on the launchpad.</li><li>Airdrops to IMD holders and launchpad users.</li><li>Ecosystem reserves for builders and Swarm credits.</li></ul></div>
        </div>
      </div>
    </section>
  );
}

const REV = [
  { k: "treasury", label: "IMD ecosystem treasury", pct: 25, note: "Multisig" },
  { k: "operations", label: "Operations and development", pct: 20, note: "Running costs" },
  { k: "nftRewards", label: "IMD NFT worker rewards", pct: 20, note: "Paid to Swarm seat holders" },
  { k: "buybackBurn", label: "IMD buyback and permanent burn", pct: 20, note: "Bought on-market, then burned" },
  { k: "developer", label: "Developer IMD accumulation", pct: 15, note: "Held in IMD" },
] as const;

export function Rewards() {
  const supply = useReadContract({ address: IMD_TOKEN, abi: ERC20, functionName: "totalSupply", chainId: ETH_CHAIN_ID });
  const published = Object.values(OWNER.revenueWallets).some(Boolean);
  return (
    <section className="wrap section" aria-labelledby="rw-title">
      <h1 id="rw-title" className="page-title">Revenue, burns and workers</h1>
      <p className="lede">Where eligible net platform revenue goes, and how IMD NFT workers earn.</p>
      <div className="token-grid">
        <div className="card"><h2>Revenue split</h2><Split items={REV} wallets={OWNER.revenueWallets} chain="eth" /><p className="hint">Only net platform revenue is split. Customer deposits and Swarm job fees paid to IMD Intakev2 are never counted as revenue.</p></div>
        <div className="stack">
          <div className="card"><h2>IMD on Ethereum</h2><dl className="facts"><div><dt>Token</dt><dd><a className="mono-wrap" href={etherscanAddr(IMD_TOKEN)} target="_blank" rel="noreferrer">{IMD_TOKEN}</a></dd></div><div><dt>Total supply</dt><dd className="num">{fmtUnits(supply.data as bigint | undefined, 18, 0)} IMD</dd></div></dl></div>
          <div className="card"><h2>Public reporting</h2><p className="muted">{published ? "Each wallet above links to its full on-chain history." : "The treasury, burn and reward wallets haven't been published yet, so no split has been executed. Once they are, every transfer and burn is verifiable on Etherscan from this page."}</p></div>
        </div>
      </div>
    </section>
  );
}
