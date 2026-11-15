import { useEffect, useState, type FormEvent } from "react";
import { compact, pct, usd } from "../lib/format";
import { search, tokenPairs, trending, type Pair } from "../lib/market";
import { useStored, type Launched } from "../lib/store";

export function TokenRows({ pairs }: { pairs: Pair[] | null }) {
  const [watch, setWatch] = useStored<string[]>("watchlist", []);
  if (!pairs) return <ul className="token-list" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="token-row skeleton" />)}</ul>;
  if (!pairs.length) return <p className="muted">Nothing to show.</p>;
  return (
    <ul className="token-list">
      {pairs.map((p) => {
        const m = p.baseToken.address, on = watch.includes(m), ch = p.priceChange?.h24;
        return (
          <li key={m} className="token-row">
            <a className="token-link" href={`#/token/${m}`}>
              {p.info?.imageUrl ? <img className="thumb" src={p.info.imageUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="thumb thumb-empty" aria-hidden="true" />}
              <span className="token-name"><strong>{p.baseToken.name}</strong><span className="muted">{p.baseToken.symbol}</span></span>
              <span className="token-stat num"><span>{usd(Number(p.priceUsd))}</span><br /><span className={ch == null ? "muted" : ch >= 0 ? "up" : "down"}>{pct(ch)}</span></span>
              <span className="token-stat num hide-sm muted">MC {compact(p.marketCap ?? p.fdv)}<br />Vol {compact(p.volume?.h24)}</span>
            </a>
            <button type="button" className="icon-button" aria-pressed={on} aria-label={on ? `Remove ${p.baseToken.symbol} from watchlist` : `Add ${p.baseToken.symbol} to watchlist`} onClick={() => setWatch((w) => (on ? w.filter((x) => x !== m) : [m, ...w]))}>{on ? "★" : "☆"}</button>
          </li>
        );
      })}
    </ul>
  );
}

export function TrendingList({ limit }: { limit?: number }) {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => { trending().then((p) => setPairs(limit ? p.slice(0, limit) : p)).catch(() => setBad(true)); }, [limit]);
  return bad ? <p className="muted">Market data didn't load. Check your connection and reload.</p> : <TokenRows pairs={pairs} />;
}

export function Discover() {
  const [tab, setTab] = useState<"trending" | "watch" | "here">("trending");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Pair[] | null | undefined>(undefined);
  const [watch] = useStored<string[]>("watchlist", []);
  const [launched] = useStored<Launched[]>("launched", []);
  const [watchPairs, setWatchPairs] = useState<Pair[] | null>(null);
  useEffect(() => { if (tab === "watch") { setWatchPairs(null); tokenPairs(watch).then(setWatchPairs).catch(() => setWatchPairs([])); } }, [tab, watch]);
  async function go(e: FormEvent) { e.preventDefault(); if (!q.trim()) return; setRes(null); setRes(await search(q.trim()).catch(() => [])); }
  return (
    <section className="wrap section" aria-labelledby="disc-title">
      <h1 id="disc-title" className="page-title">Discover tokens</h1>
      <form className="search" onSubmit={go} role="search">
        <label htmlFor="q" className="visually-hidden">Search Solana tokens</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ticker or mint" />
        <button className="button" type="submit">Search</button>
      </form>
      {res !== undefined ? (<><div className="section-head"><h2>Results</h2><button type="button" className="link-button" onClick={() => setRes(undefined)}>Clear</button></div><TokenRows pairs={res} /></>) : (
        <>
          <div className="tabs" role="group" aria-label="Token lists">
            {([["trending", "Trending"], ["watch", "Watchlist"], ["here", "Launched here"]] as const).map(([k, l]) => <button key={k} type="button" className="tab" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === "trending" && <TrendingList />}
          {tab === "watch" && (watch.length ? <TokenRows pairs={watchPairs} /> : <p className="muted">Tap ☆ on any token to watch it.</p>)}
          {tab === "here" && (launched.length ? (
            <ul className="token-list">{launched.map((l) => <li key={l.mint} className="token-row"><a className="token-link" href={`#/token/${l.mint}`}>{l.image ? <img className="thumb" src={l.image} alt="" width={40} height={40} /> : <span className="thumb thumb-empty" />}<span className="token-name"><strong>{l.name}</strong><span className="muted">{l.symbol} · {l.cluster}</span></span></a></li>)}</ul>
          ) : <p className="muted">Tokens you launch from this device appear here. <a href="#/">Create one</a></p>)}
          <p className="hint">Prices and volume from DexScreener.</p>
        </>
      )}
    </section>
  );
}
