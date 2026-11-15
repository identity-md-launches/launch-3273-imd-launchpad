import { DEXSCREENER_API } from "../config";

export interface Pair { chainId: string; pairAddress: string; url: string; dexId: string; baseToken: { address: string; name: string; symbol: string }; priceUsd?: string; priceNative?: string; priceChange?: { h24?: number; h1?: number }; volume?: { h24?: number }; liquidity?: { usd?: number }; marketCap?: number; fdv?: number; txns?: { h24?: { buys: number; sells: number }; h1?: { buys: number; sells: number } }; info?: { imageUrl?: string; websites?: { url: string }[]; socials?: { type: string; url: string }[] }; pairCreatedAt?: number }

const j = async <T,>(u: string): Promise<T> => { const r = await fetch(u); if (!r.ok) throw new Error(`DexScreener ${r.status}`); return r.json() as Promise<T>; };
const best = (pairs: Pair[]) => {
  const m = new Map<string, Pair>();
  for (const p of pairs) { const k = p.baseToken.address; const o = m.get(k); if (!o || (p.liquidity?.usd ?? 0) > (o.liquidity?.usd ?? 0)) m.set(k, p); }
  return [...m.values()];
};
/** Trending Solana tokens: DexScreener's most-boosted list, priced from their live pairs. */
export async function trending(): Promise<Pair[]> {
  const boosts = await j<{ chainId: string; tokenAddress: string }[]>(`${DEXSCREENER_API}/token-boosts/top/v1`);
  const mints = [...new Set(boosts.filter((b) => b.chainId === "solana").map((b) => b.tokenAddress))].slice(0, 30);
  if (!mints.length) return [];
  return best(await j<Pair[]>(`${DEXSCREENER_API}/tokens/v1/solana/${mints.join(",")}`)).sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
}
export async function search(q: string): Promise<Pair[]> {
  const r = await j<{ pairs: Pair[] }>(`${DEXSCREENER_API}/latest/dex/search?q=${encodeURIComponent(q)}`);
  return best((r.pairs ?? []).filter((p) => p.chainId === "solana"));
}
export async function tokenPairs(mints: string[]): Promise<Pair[]> {
  if (!mints.length) return [];
  return best(await j<Pair[]>(`${DEXSCREENER_API}/tokens/v1/solana/${mints.slice(0, 30).join(",")}`));
}
