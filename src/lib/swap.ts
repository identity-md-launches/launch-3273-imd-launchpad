import { PublicKey, VersionedTransaction, type Connection } from "@solana/web3.js";
import { getAccount, getPublicClient, readContract, sendTransaction, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { Buffer } from "buffer";
import { ETH_CHAIN_ID, IMD_TOKEN, JUPITER_API, KYBER_API, LIFI_API, LIFI_SOLANA_CHAIN, OWNER } from "../config";
import { ERC20, wagmiConfig } from "../wallet/eth";
import { signSendConfirm, type SolProvider } from "../wallet/solana";
import { logTx, updateTx } from "./store";

export type Chain = "ethereum" | "solana";
export interface Token { key: string; symbol: string; name: string; chain: Chain; address: string; decimals: number; native?: boolean; lifi: string; unavailable?: string }

/** Kyber's documented sentinel for native ETH. */
const KYBER_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WSOL = "So11111111111111111111111111111111111111112";

/** Verified mainnet addresses: IMD from the IMD intake, the rest from the issuers (Circle, Tether, Solana). */
export const TOKENS: Token[] = [
  { key: "IMD", symbol: "IMD", name: "IMD", chain: "ethereum", address: IMD_TOKEN, decimals: 18, lifi: IMD_TOKEN },
  { key: "ETH", symbol: "ETH", name: "Ether", chain: "ethereum", address: KYBER_NATIVE, decimals: 18, native: true, lifi: "ETH" },
  { key: "USDC-ETH", symbol: "USDC", name: "USD Coin", chain: "ethereum", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, lifi: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { key: "USDT-ETH", symbol: "USDT", name: "Tether USD", chain: "ethereum", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, lifi: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { key: "SOL", symbol: "SOL", name: "Solana", chain: "solana", address: WSOL, decimals: 9, native: true, lifi: "SOL" },
  { key: "USDC-SOL", symbol: "USDC", name: "USD Coin", chain: "solana", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, lifi: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { key: "USDT-SOL", symbol: "USDT", name: "Tether USD", chain: "solana", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, lifi: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
  {
    key: "PIMD", symbol: "PIMD", name: "Pump IMD", chain: "solana", address: OWNER.pimdMint, decimals: 6, lifi: OWNER.pimdMint,
    unavailable: OWNER.pimdMint ? undefined : "PIMD isn't deployed yet, so it has no mint address and no liquidity to swap against. It becomes swappable here the moment its approved mint is published.",
  },
];
export const tokenByKey = (k: string) => TOKENS.find((t) => t.key === k);
export const chainLabel = (c: Chain) => (c === "ethereum" ? "Ethereum" : "Solana");

export interface FeeLine { label: string; value: string }
export interface Quote {
  provider: "KyberSwap" | "Jupiter" | "LI.FI";
  from: Token; to: Token; amountIn: bigint; amountOut: bigint; minOut: bigint;
  route: string[]; fees: FeeLine[]; priceImpact: number | null; usdIn: number | null; usdOut: number | null; seconds: number; at: number;
  raw: unknown; executable: boolean;
}

export class NoRoute extends Error {}
/** The executable quote returns less than the minimum the visitor reviewed: show it and ask again, never sign it. */
export class Requote extends Error { constructor(public quote: Quote) { super("The locked quote returns less than the minimum you reviewed. Review the new quote and confirm again."); } }
const usdS = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) } });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, j };
}
/**
 * A non-success answer that is not the provider's own JSON verdict (HTML error pages, auth, rate limits, outages)
 * means the service itself is unavailable; that is reported as such, never as missing liquidity.
 */
function ensureService(name: string, res: { ok: boolean; status: number; j: any }) {
  if (res.ok) return;
  if (res.j == null || typeof res.j !== "object" || [401, 403, 429].includes(res.status) || res.status >= 500)
    throw new NoRoute(`${name} quote service unavailable (HTTP ${res.status}). Try again later.`);
}

/** Ethereum to Ethereum: KyberSwap Aggregator, 0x-equivalent and keyless. */
async function kyberQuote(from: Token, to: Token, amountIn: bigint, slipBps: number): Promise<Quote> {
  const res = await getJson(`${KYBER_API}/routes?tokenIn=${from.address}&tokenOut=${to.address}&amountIn=${amountIn}&gasInclude=true`, { headers: { "x-client-id": "imd-launchpad" } });
  ensureService("KyberSwap", res);
  const { j } = res;
  const s = j?.data?.routeSummary;
  if (!s) throw new NoRoute(`KyberSwap found no Ethereum route: ${j?.message ?? "no liquidity for this pair and size"}.`);
  const out = BigInt(s.amountOut);
  const hops: string[] = Array.from(new Set((s.route as any[][]).flat().map((h) => String(h.exchange ?? "pool"))));
  const usdIn = Number(s.amountInUsd), usdOut = Number(s.amountOutUsd);
  return {
    provider: "KyberSwap", from, to, amountIn, amountOut: out, minOut: (out * BigInt(10000 - slipBps)) / 10000n,
    route: hops, fees: [{ label: "Network gas (estimate)", value: usdS(Number(s.gasUsd)) }, { label: "Aggregator fee", value: "None charged by this site; pool fees are in the price" }],
    priceImpact: usdIn > 0 ? ((usdOut - usdIn) / usdIn) * 100 : null, usdIn, usdOut, seconds: 15, at: Date.now(), raw: j.data, executable: true,
  };
}

/** Solana to Solana: Jupiter's public Swap API. */
async function jupQuote(from: Token, to: Token, amountIn: bigint, slipBps: number): Promise<Quote> {
  const res = await getJson(`${JUPITER_API}/swap/v1/quote?inputMint=${from.address}&outputMint=${to.address}&amount=${amountIn}&slippageBps=${slipBps}&restrictIntermediateTokens=true`);
  ensureService("Jupiter", res);
  const { j } = res;
  if (!j?.outAmount) throw new NoRoute(`Jupiter found no Solana route: ${j?.error ?? j?.errorCode ?? "no liquidity for this pair and size"}.`);
  return {
    provider: "Jupiter", from, to, amountIn, amountOut: BigInt(j.outAmount), minOut: BigInt(j.otherAmountThreshold),
    route: (j.routePlan as any[]).map((p) => String(p.swapInfo?.label ?? "pool")),
    fees: [{ label: "Network fee", value: "About 0.00001 SOL plus a priority fee capped at 0.001 SOL" }, { label: "Aggregator fee", value: j.platformFee ? `${j.platformFee.feeBps} bps` : "None; pool fees are in the price" }],
    priceImpact: j.priceImpactPct != null ? -Math.abs(Number(j.priceImpactPct) * 100) : null, usdIn: null, usdOut: null, seconds: 10, at: Date.now(), raw: j, executable: true,
  };
}

/** Ethereum and Solana across: LI.FI, which picks among bridges (NearIntents, Mayan, Allbridge…). */
async function lifiQuote(from: Token, to: Token, amountIn: bigint, slipBps: number, fromAddr?: string, toAddr?: string): Promise<Quote> {
  const fc = from.chain === "ethereum" ? ETH_CHAIN_ID : LIFI_SOLANA_CHAIN, tc = to.chain === "ethereum" ? ETH_CHAIN_ID : LIFI_SOLANA_CHAIN;
  if (fromAddr && toAddr) {
    const res = await getJson(`${LIFI_API}/quote?fromChain=${fc}&toChain=${tc}&fromToken=${from.lifi}&toToken=${to.lifi}&fromAmount=${amountIn}&fromAddress=${fromAddr}&toAddress=${toAddr}&slippage=${slipBps / 10000}`);
    ensureService("LI.FI", res);
    const { j } = res;
    if (!j?.estimate) throw new NoRoute(`LI.FI found no cross-chain route: ${j?.message ?? "no bridge covers this pair and size right now"}.`);
    const e = j.estimate;
    return {
      provider: "LI.FI", from, to, amountIn, amountOut: BigInt(e.toAmount), minOut: BigInt(e.toAmountMin),
      route: [j.toolDetails?.name, ...((j.includedSteps ?? []) as any[]).map((s) => s.toolDetails?.name)].filter((x, i, a) => realStep(x) && a.indexOf(x) === i),
      fees: lifiFees(e), priceImpact: pi(e.fromAmountUSD, e.toAmountUSD), usdIn: Number(e.fromAmountUSD) || null, usdOut: Number(e.toAmountUSD) || null,
      seconds: Number(e.executionDuration) || 60, at: Date.now(), raw: j, executable: true,
    };
  }
  const res = await getJson(`${LIFI_API}/advanced/routes`, { method: "POST", body: JSON.stringify({ fromChainId: fc, toChainId: tc, fromTokenAddress: from.lifi, toTokenAddress: to.lifi, fromAmount: amountIn.toString(), options: { slippage: slipBps / 10000 } }) });
  ensureService("LI.FI", res);
  const { j } = res;
  const r = j?.routes?.[0];
  if (!r) throw new NoRoute(`LI.FI found no cross-chain route: ${j?.message ?? "no bridge covers this pair and size right now"}.`);
  const steps = r.steps as any[];
  return {
    provider: "LI.FI", from, to, amountIn, amountOut: BigInt(r.toAmount), minOut: BigInt(r.toAmountMin),
    route: steps.flatMap((s) => (s.includedSteps ?? [s]).map((i: any) => i.toolDetails?.name)).filter((x, i, a) => realStep(x) && a.indexOf(x) === i),
    fees: steps.flatMap((s) => lifiFees(s.estimate)), priceImpact: pi(r.fromAmountUSD, r.toAmountUSD), usdIn: Number(r.fromAmountUSD) || null, usdOut: Number(r.toAmountUSD) || null,
    seconds: steps.reduce((a, s) => a + (Number(s.estimate?.executionDuration) || 0), 0) || 60, at: Date.now(), raw: r, executable: false,
  };
}
const realStep = (x: unknown) => typeof x === "string" && !/fee/i.test(x);
const pi = (a: string, b: string) => (Number(a) > 0 ? ((Number(b) - Number(a)) / Number(a)) * 100 : null);
function lifiFees(e: any): FeeLine[] {
  const f = ((e?.feeCosts ?? []) as any[]).map((c) => ({ label: c.name, value: c.amountUSD ? usdS(Number(c.amountUSD)) : `${c.amount} ${c.token?.symbol ?? ""}` }));
  const gas = ((e?.gasCosts ?? []) as any[]).reduce((a, c) => a + (Number(c.amountUSD) || 0), 0);
  return gas ? [...f, { label: "Source network gas (estimate)", value: usdS(gas) }] : f;
}

export async function getQuote(from: Token, to: Token, amountIn: bigint, slipBps: number, ethAddr?: string, solAddr?: string): Promise<Quote> {
  for (const t of [from, to]) if (t.unavailable) throw new NoRoute(t.unavailable);
  if (from.key === to.key) throw new NoRoute("Pick two different assets.");
  if (from.chain === to.chain) return from.chain === "ethereum" ? kyberQuote(from, to, amountIn, slipBps) : jupQuote(from, to, amountIn, slipBps);
  const fromAddr = from.chain === "ethereum" ? ethAddr : solAddr, toAddr = to.chain === "ethereum" ? ethAddr : solAddr;
  return lifiQuote(from, to, amountIn, slipBps, fromAddr, toAddr);
}

export type Step = { label: string; state: "todo" | "now" | "done" | "stop"; detail?: string; href?: string };
type Progress = (steps: Step[]) => void;

async function ensureAllowance(token: Token, spender: `0x${string}`, amount: bigint, owner: `0x${string}`, say: (d: string) => void) {
  if (token.native) return;
  const addr = token.address as `0x${string}`;
  const current = (await readContract(wagmiConfig, { address: addr, abi: ERC20, functionName: "allowance", args: [owner, spender], chainId: ETH_CHAIN_ID })) as bigint;
  if (current >= amount) return;
  if (current > 0n && token.symbol === "USDT") {
    say("USDT needs its old allowance reset to zero first. Confirm in your wallet.");
    const h0 = await writeContract(wagmiConfig, { address: addr, abi: ERC20, functionName: "approve", args: [spender, 0n], chainId: ETH_CHAIN_ID });
    await waitForTransactionReceipt(wagmiConfig, { hash: h0, chainId: ETH_CHAIN_ID });
  }
  say(`Approve exactly this amount of ${token.symbol}, never an unlimited allowance. Confirm in your wallet.`);
  const h = await writeContract(wagmiConfig, { address: addr, abi: ERC20, functionName: "approve", args: [spender, amount], chainId: ETH_CHAIN_ID });
  logTx({ id: h, chain: "ethereum", kind: "approve", label: `Approve ${token.symbol}`, status: "pending", account: owner });
  const r = await waitForTransactionReceipt(wagmiConfig, { hash: h, chainId: ETH_CHAIN_ID });
  updateTx(h, r.status === "success" ? "confirmed" : "failed");
  if (r.status !== "success") throw new Error("The approval reverted. Nothing was swapped.");
}

/** Simulate, then send an EVM transaction the visitor signs. */
async function sendEvm(tx: { to: `0x${string}`; data: `0x${string}`; value: bigint }, label: string): Promise<`0x${string}`> {
  const account = getAccount(wagmiConfig).address!;
  const pc = getPublicClient(wagmiConfig, { chainId: ETH_CHAIN_ID })!;
  try { await pc.call({ account, to: tx.to, data: tx.data, value: tx.value }); }
  catch (e) { throw new Error(`The swap failed in simulation, so nothing was sent: ${(e as any)?.shortMessage ?? (e as Error).message}`); }
  const h = await sendTransaction(wagmiConfig, { ...tx, chainId: ETH_CHAIN_ID });
  logTx({ id: h, chain: "ethereum", kind: "swap", label, status: "pending", account });
  return h;
}

/** Simulate, then sign and send a Solana transaction from an aggregator. */
async function sendSol(b64: string, provider: SolProvider, connection: Connection, label: string, account: string): Promise<string> {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  if (sim.value.err) throw new Error(`The swap failed in simulation, so nothing was sent: ${JSON.stringify(sim.value.err)}`);
  const sig = await signSendConfirm(provider, connection, tx);
  logTx({ id: sig, chain: "solana", cluster: "mainnet", kind: "swap", label, status: "confirmed", account });
  return sig;
}

export async function executeSwap(q: Quote, slipBps: number, ctx: { ethAddr?: `0x${string}`; solAddr?: string; solProvider?: SolProvider | null; solConn: Connection }, progress: Progress): Promise<void> {
  const label = `Swap ${q.from.symbol} (${chainLabel(q.from.chain)}) to ${q.to.symbol} (${chainLabel(q.to.chain)})`;
  const steps: Step[] = [];
  const push = (s: Step) => { steps.push(s); progress([...steps]); };
  const set = (patch: Partial<Step>) => { Object.assign(steps[steps.length - 1], patch); progress([...steps]); };

  if (q.provider === "KyberSwap") {
    const owner = ctx.ethAddr!;
    push({ label: "Build the route", state: "now" });
    const built = await getJson(`${KYBER_API}/route/build`, { method: "POST", headers: { "x-client-id": "imd-launchpad" }, body: JSON.stringify({ routeSummary: (q.raw as any).routeSummary, sender: owner, recipient: owner, slippageTolerance: slipBps }) });
    ensureService("KyberSwap", built);
    const { j } = built;
    if (!j?.data?.data) throw new NoRoute(`KyberSwap couldn't build this route: ${j?.message ?? "the quote expired"}. Refresh the quote.`);
    const router = j.data.routerAddress as `0x${string}`;
    if (router.toLowerCase() !== String((q.raw as any).routerAddress).toLowerCase()) throw new Error("The router address changed between quote and build; refusing to sign.");
    set({ state: "done", detail: `Router ${router.slice(0, 10)}…` });
    push({ label: "Allowance", state: "now" });
    await ensureAllowance(q.from, router, q.amountIn, owner, (d) => set({ detail: d }));
    set({ state: "done", detail: q.from.native ? "Not needed for ETH" : "Exact amount approved" });
    push({ label: "Simulate and sign the swap", state: "now", detail: "Confirm in your wallet" });
    const h = await sendEvm({ to: router, data: j.data.data, value: BigInt(j.data.transactionValue ?? 0) }, label);
    set({ state: "done", detail: "Sent", href: `https://etherscan.io/tx/${h}` });
    push({ label: "Confirm on Ethereum", state: "now", href: `https://etherscan.io/tx/${h}` });
    const r = await waitForTransactionReceipt(wagmiConfig, { hash: h, chainId: ETH_CHAIN_ID });
    updateTx(h, r.status === "success" ? "confirmed" : "failed");
    if (r.status !== "success") { set({ state: "stop", detail: "Reverted on-chain, usually because the price moved past your slippage. Only gas was spent." }); return; }
    set({ state: "done", detail: `Block ${r.blockNumber}` });
    return;
  }

  if (q.provider === "Jupiter") {
    push({ label: "Build the transaction", state: "now" });
    const built = await getJson(`${JUPITER_API}/swap/v1/swap`, { method: "POST", body: JSON.stringify({ quoteResponse: q.raw, userPublicKey: ctx.solAddr, dynamicComputeUnitLimit: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1000000, priorityLevel: "high" } } }) });
    ensureService("Jupiter", built);
    const { j } = built;
    if (!j?.swapTransaction) throw new NoRoute(`Jupiter couldn't build this swap: ${j?.error ?? "the quote expired"}. Refresh the quote.`);
    set({ state: "done" });
    push({ label: "Simulate, sign and send", state: "now", detail: "Confirm in your wallet" });
    const sig = await sendSol(j.swapTransaction, ctx.solProvider!, ctx.solConn, label, ctx.solAddr!);
    set({ state: "done", detail: "Confirmed on Solana", href: `https://solscan.io/tx/${sig}` });
    return;
  }

  // LI.FI cross-chain: always re-quote with both real addresses so the transaction is bound to them.
  push({ label: "Lock a quote for your two wallets", state: "now" });
  const fresh = await lifiQuote(q.from, q.to, q.amountIn, slipBps, q.from.chain === "ethereum" ? ctx.ethAddr : ctx.solAddr, q.to.chain === "ethereum" ? ctx.ethAddr : ctx.solAddr);
  const lq = fresh.raw as any;
  // The reviewed minimum is a hard floor: anything lower goes back to the visitor for a new review before any signing.
  if (fresh.minOut < q.minOut) { set({ state: "stop", detail: "The locked quote is below the minimum you reviewed. Nothing was signed." }); throw new Requote(fresh); }
  set({ state: "done", detail: `${fresh.route.join(" → ")}` });
  let srcHash: string;
  if (q.from.chain === "ethereum") {
    push({ label: "Allowance", state: "now" });
    if (!q.from.native) await ensureAllowance(q.from, lq.estimate.approvalAddress, q.amountIn, ctx.ethAddr!, (d) => set({ detail: d }));
    set({ state: "done", detail: q.from.native ? "Not needed for ETH" : "Exact amount approved" });
    push({ label: "Simulate and sign on Ethereum", state: "now", detail: "Confirm in your wallet" });
    const t = lq.transactionRequest;
    srcHash = await sendEvm({ to: t.to, data: t.data, value: BigInt(t.value ?? 0) }, label);
    set({ state: "done", href: `https://etherscan.io/tx/${srcHash}`, detail: "Sent" });
    await waitForTransactionReceipt(wagmiConfig, { hash: srcHash as `0x${string}`, chainId: ETH_CHAIN_ID }).then((r) => updateTx(srcHash, r.status === "success" ? "confirmed" : "failed"));
  } else {
    push({ label: "Simulate and sign on Solana", state: "now", detail: "Confirm in your wallet" });
    srcHash = await sendSol(lq.transactionRequest.data, ctx.solProvider!, ctx.solConn, label, ctx.solAddr!);
    set({ state: "done", href: `https://solscan.io/tx/${srcHash}`, detail: "Confirmed on Solana" });
  }
  push({ label: `Bridge with ${lq.toolDetails?.name ?? "LI.FI"}`, state: "now", detail: "Waiting for the destination chain. This page checks every 10 seconds." });
  const fc = q.from.chain === "ethereum" ? ETH_CHAIN_ID : LIFI_SOLANA_CHAIN, tc = q.to.chain === "ethereum" ? ETH_CHAIN_ID : LIFI_SOLANA_CHAIN;
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const { j } = await getJson(`${LIFI_API}/status?txHash=${srcHash}&fromChain=${fc}&toChain=${tc}&bridge=${lq.tool}`);
    const st = j?.status;
    if (st === "DONE") {
      const rx = j.receiving?.txHash as string | undefined;
      set({ state: "done", detail: j.substatus === "PARTIAL" ? "Done, but you received a different token than planned; check the receiving wallet." : "Delivered", href: rx ? (q.to.chain === "ethereum" ? `https://etherscan.io/tx/${rx}` : `https://solscan.io/tx/${rx}`) : undefined });
      return;
    }
    if (st === "FAILED") { set({ state: "stop", detail: `The bridge reported a failure (${j.substatus ?? "unknown"}). Funds are refunded by the bridge; track it on LI.FI's explorer.`, href: `https://scan.li.fi/tx/${srcHash}` }); return; }
    set({ detail: `${j?.substatusMessage ?? "In progress"}`, href: `https://scan.li.fi/tx/${srcHash}` });
  }
  set({ state: "stop", detail: "Still in flight after 30 minutes. Keep the source transaction link and track it on LI.FI's explorer.", href: `https://scan.li.fi/tx/${srcHash}` });
}

/** USD prices for the listed tokens, from LI.FI's token API. */
export async function fetchPrices(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.allSettled(TOKENS.filter((t) => !t.unavailable).map(async (t) => {
    const { j } = await getJson(`${LIFI_API}/token?chain=${t.chain === "ethereum" ? ETH_CHAIN_ID : LIFI_SOLANA_CHAIN}&token=${t.lifi}`);
    if (j?.priceUSD) out[t.key] = Number(j.priceUSD);
  }));
  return out;
}

/** Balances for every listed token the connected wallets can hold. */
export async function fetchBalances(ethAddr: string | undefined, solAddr: string | null, solConn: Connection): Promise<Record<string, bigint | null>> {
  const out: Record<string, bigint | null> = {};
  const jobs: Promise<void>[] = [];
  if (ethAddr) {
    const pc = getPublicClient(wagmiConfig, { chainId: ETH_CHAIN_ID })!;
    for (const t of TOKENS.filter((x) => x.chain === "ethereum")) {
      jobs.push((t.native ? pc.getBalance({ address: ethAddr as `0x${string}` }) : (pc.readContract({ address: t.address as `0x${string}`, abi: ERC20, functionName: "balanceOf", args: [ethAddr as `0x${string}`] }) as Promise<bigint>))
        .then((v) => { out[t.key] = v; }).catch(() => { out[t.key] = null; }));
    }
  }
  if (solAddr) {
    const owner = new PublicKey(solAddr);
    for (const t of TOKENS.filter((x) => x.chain === "solana" && !x.unavailable)) {
      jobs.push((t.native ? solConn.getBalance(owner).then(BigInt) : solConn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(t.address) }).then((r) => r.value.reduce((a, acc) => a + BigInt(acc.account.data.parsed.info.tokenAmount.amount), 0n)))
        .then((v) => { out[t.key] = v; }).catch(() => { out[t.key] = null; }));
    }
  }
  await Promise.all(jobs);
  return out;
}
