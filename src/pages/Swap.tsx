import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { Flow, type FlowItem } from "../components/Flow";
import { ETH_CHAIN_ID, OWNER } from "../config";
import { declined, errMsg, etherscanToken, fmtUnits, solscanToken, toUnits, usd } from "../lib/format";
import { useRoute } from "../lib/route";
import { NoRoute, TOKENS, chainLabel, executeSwap, fetchBalances, fetchPrices, getQuote, tokenByKey, type Quote, type Token } from "../lib/swap";
import { connectionFor, useSolana } from "../wallet/solana";
import { useWalletSheet } from "../wallet/WalletSheet";

const SLIPS = [10, 50, 100];
const opt = (t: Token) => `${t.symbol} · ${chainLabel(t.chain)}${t.unavailable ? " (not deployed)" : ""}`;

function TokenSelect({ id, value, onChange, label }: { id: string; value: string; onChange(v: string): void; label: string }) {
  return (
    <select id={id} aria-label={label} className="select-small" value={value} onChange={(e) => onChange(e.target.value)}>
      {(["ethereum", "solana"] as const).map((c) => <optgroup key={c} label={chainLabel(c)}>{TOKENS.filter((t) => t.chain === c).map((t) => <option key={t.key} value={t.key}>{opt(t)}</option>)}</optgroup>)}
    </select>
  );
}

export function Swap() {
  const { query } = useRoute();
  const { open } = useWalletSheet();
  const { address: ethAddr, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { address: solAddr, provider: solProvider } = useSolana();
  const solConn = connectionFor("mainnet");
  const [fromKey, setFromKey] = useState(tokenByKey(query.get("from") ?? "")?.key ?? "ETH");
  const [toKey, setToKey] = useState(tokenByKey(query.get("to") ?? "")?.key ?? "IMD");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(50);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qState, setQState] = useState<"idle" | "loading" | "error">("idle");
  const [qErr, setQErr] = useState("");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [bals, setBals] = useState<Record<string, bigint | null>>({});
  const [review, setReview] = useState(false);
  const [steps, setSteps] = useState<FlowItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [xErr, setXErr] = useState("");
  const seq = useRef(0);
  const from = tokenByKey(fromKey)!, to = tokenByKey(toKey)!;
  const amt = toUnits(amount, from.decimals);
  const cross = from.chain !== to.chain;

  useEffect(() => { fetchPrices().then(setPrices).catch(() => {}); }, []);
  const refreshBals = () => fetchBalances(ethAddr, solAddr, solConn).then(setBals).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refreshBals(); }, [ethAddr, solAddr]);

  useEffect(() => {
    setQuote(null); setReview(false); setQErr("");
    if (!amt || amt <= 0n) { setQState("idle"); return; }
    const n = ++seq.current;
    setQState("loading");
    const run = () => getQuote(from, to, amt, slip, ethAddr, solAddr ?? undefined)
      .then((q) => { if (n === seq.current) { setQuote(q); setQState("idle"); } })
      .catch((e) => { if (n === seq.current) { setQErr(e instanceof NoRoute ? e.message : `The quote service didn't answer: ${errMsg(e)}. Try again.`); setQState("error"); } });
    const t = setTimeout(run, 500);
    const r = setInterval(() => { if (!running) void run(); }, 30000);
    return () => { clearTimeout(t); clearInterval(r); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, toKey, amount, slip, ethAddr, solAddr]);

  const needEth = from.chain === "ethereum" || to.chain === "ethereum";
  const needSol = from.chain === "solana" || to.chain === "solana";
  const bal = bals[from.key];
  const short = bal != null && amt != null && amt > bal;
  const rate = quote ? Number(fmtUnits(quote.amountOut, to.decimals, 8).replace(/,/g, "")) / Number(fmtUnits(quote.amountIn, from.decimals, 8).replace(/,/g, "")) : null;

  async function run() {
    if (!quote) return;
    setRunning(true); setXErr(""); setSteps([]);
    try {
      await executeSwap(quote, slip, { ethAddr, solAddr: solAddr ?? undefined, solProvider, solConn }, (s) => setSteps(s));
      void refreshBals();
    } catch (e) {
      const m = errMsg(e);
      setXErr(declined(m) ? "You declined in your wallet. Nothing was sent." : e instanceof NoRoute ? m : `The swap stopped: ${m}`);
      setSteps((s) => (s ?? []).map((x) => (x.state === "now" ? { ...x, state: "stop" } : x)));
    } finally { setRunning(false); setReview(false); }
  }

  let action: { label: string; onClick?: () => void; disabled?: boolean };
  if (needEth && !ethAddr) action = { label: "Connect an Ethereum wallet", onClick: () => open("ethereum") };
  else if (needSol && !solAddr) action = { label: "Connect a Solana wallet", onClick: () => open("solana") };
  else if (needEth && chainId !== ETH_CHAIN_ID) action = { label: "Switch to Ethereum Mainnet", onClick: () => switchChain({ chainId: ETH_CHAIN_ID }) };
  else if (!amt) action = { label: "Enter an amount", disabled: true };
  else if (short) action = { label: `Not enough ${from.symbol}`, disabled: true };
  else if (!quote) action = { label: qState === "loading" ? "Finding the best route…" : "No route", disabled: true };
  else if (!review) action = { label: "Review swap", onClick: () => setReview(true) };
  else action = { label: running ? "Swapping…" : "Confirm swap in wallet", onClick: run, disabled: running };

  return (
    <section className="wrap section" aria-labelledby="swap-title">
      <h1 id="swap-title" className="page-title">Swap</h1>
      <p className="muted">IMD, ETH, USDC and USDT on Ethereum; SOL, USDC, USDT and PIMD on Solana; and across the two. Non-custodial: you sign every transaction.</p>
      <div className="token-grid">
        <div className="card stack">
          <div className="field">
            <div className="field-head"><label htmlFor="s-amt">You pay</label><span className="hint num">Balance {bal === undefined ? "–" : fmtUnits(bal, from.decimals)} {bal != null && bal > 0n && <button type="button" className="link-button" onClick={() => setAmount(fmtUnits(from.native ? (bal * 98n) / 100n : bal, from.decimals, from.decimals).replace(/,/g, ""))}>Max</button>}</span></div>
            <div className="swap-row"><input id="s-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} placeholder="0.0" autoComplete="off" /><TokenSelect id="s-from" label="Pay with" value={fromKey} onChange={setFromKey} /></div>
            <p className="hint num">{amt && prices[from.key] ? usd(Number(amount) * prices[from.key]) : " "}</p>
          </div>
          <button type="button" className="button button-small flip" aria-label="Swap direction" onClick={() => { setFromKey(toKey); setToKey(fromKey); }}>↑↓</button>
          <div className="field">
            <div className="field-head"><label htmlFor="s-out">You receive (estimated)</label><span className="hint num">Balance {bals[to.key] === undefined ? "–" : fmtUnits(bals[to.key], to.decimals)}</span></div>
            <div className="swap-row"><input id="s-out" readOnly value={quote ? fmtUnits(quote.amountOut, to.decimals, 6).replace(/,/g, "") : ""} placeholder={qState === "loading" ? "Quoting…" : "0.0"} /><TokenSelect id="s-to" label="Receive" value={toKey} onChange={setToKey} /></div>
          </div>
          <fieldset className="field"><legend>Slippage limit</legend>
            <div className="actions">{SLIPS.map((s) => <button key={s} type="button" className="button button-small" aria-pressed={slip === s} onClick={() => setSlip(s)}>{s / 100}%</button>)}
              <label className="visually-hidden" htmlFor="s-slip">Custom slippage percent</label><input id="s-slip" className="select-small slip-input" inputMode="decimal" placeholder="Custom %" onChange={(e) => { const v = Math.round(Number(e.target.value) * 100); if (v > 0 && v <= 5000) setSlip(v); }} /></div>
            {slip > 300 && <p className="hint hint-warn">High slippage: you may receive much less than quoted.</p>}
          </fieldset>
          {qState === "error" && <p className="error" role="alert">{qErr}</p>}
          {quote && (
            <dl className="facts" aria-live="polite">
              <div><dt>Route</dt><dd>{quote.provider}: {quote.route.join(" → ") || "direct"}</dd></div>
              <div><dt>Network</dt><dd>{cross ? `${chainLabel(from.chain)} → ${chainLabel(to.chain)}` : chainLabel(from.chain)} mainnet</dd></div>
              <div><dt>Rate</dt><dd className="num">1 {from.symbol} = {rate != null ? rate.toPrecision(6) : "…"} {to.symbol}</dd></div>
              <div><dt>Minimum received</dt><dd className="num">{fmtUnits(quote.minOut, to.decimals, 6)} {to.symbol}</dd></div>
              {quote.priceImpact != null && <div><dt>Price impact</dt><dd className={`num ${quote.priceImpact < -3 ? "down" : ""}`}>{quote.priceImpact.toFixed(2)}%</dd></div>}
              {quote.usdIn != null && <div><dt>Value</dt><dd className="num">{usd(quote.usdIn)} → {usd(quote.usdOut)}</dd></div>}
              {quote.fees.map((f, i) => <div key={i}><dt>{f.label}</dt><dd className="num">{f.value}</dd></div>)}
              <div><dt>Estimated time</dt><dd className="num">{quote.seconds < 90 ? `${quote.seconds} s` : `${Math.round(quote.seconds / 60)} min`}</dd></div>
            </dl>
          )}
          {cross && quote && !quote.executable && <p className="hint">Preview quote. Connecting both wallets locks it to your addresses before you sign.</p>}
          {review && quote && <p className="hint hint-warn">Check the route above. Your wallet shows the exact transaction; the site simulates it first and stops if it would fail.</p>}
          <div className="actions"><button type="button" className="button button-primary button-wide" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>{review && !running && <button type="button" className="button button-quiet" onClick={() => setReview(false)}>Back</button>}</div>
          {xErr && <p className="error" role="alert">{xErr}</p>}
          {steps && steps.length > 0 && <Flow items={steps} label="Swap status" />}
        </div>
        <div className="stack">
          <div className="card">
            <h2>Assets</h2>
            <ul className="split-list">
              {TOKENS.map((t) => (
                <li key={t.key}>
                  <span className={`dot chain-${t.chain === "ethereum" ? "eth" : "sol"}`} aria-hidden="true" />
                  <span><strong>{t.symbol} <span className="muted">{chainLabel(t.chain)}</span></strong>{t.unavailable ? <span className="muted">Not deployed</span> : <a className="mono-wrap" href={t.native ? (t.chain === "ethereum" ? "https://etherscan.io/" : "https://solscan.io/") : t.chain === "ethereum" ? etherscanToken(t.address) : solscanToken(t.address)} target="_blank" rel="noreferrer">{t.native ? "Native" : `${t.address.slice(0, 6)}…${t.address.slice(-4)}`}</a>}</span>
                  <span className="num">{prices[t.key] ? usd(prices[t.key]) : t.unavailable ? "–" : "…"}{bals[t.key] != null && <><br /><span className="muted">{fmtUnits(bals[t.key], t.decimals)}</span></>}</span>
                </li>
              ))}
            </ul>
            <p className="hint">Prices from LI.FI's token API. Balances read from Ethereum and Solana mainnet.</p>
          </div>
          <div className="card">
            <h2>Routes</h2>
            <ul className="bullets">
              <li>Ethereum ↔ Ethereum: KyberSwap Aggregator.</li>
              <li>Solana ↔ Solana: Jupiter.</li>
              <li>Ethereum ↔ Solana: LI.FI, which picks a bridge such as NearIntents or Mayan and shows it before you sign.</li>
              <li>{OWNER.pimdMint ? "PIMD trades through Jupiter once it has liquidity." : "PIMD has no route until it is deployed and has liquidity."}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
