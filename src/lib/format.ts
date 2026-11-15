import { formatUnits, parseUnits } from "viem";
import type { Cluster } from "../config";

export const short = (a: string, n = 4) => (a.length > 2 * n + 3 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a);

/** Human amount from base units, trimmed to `max` fraction digits. */
export function fmtUnits(v: bigint | undefined | null, decimals: number, max = 4): string {
  if (v == null) return "…";
  const s = formatUnits(v, decimals);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, max).replace(/0+$/, "");
  const int = BigInt(i).toLocaleString("en-US");
  return frac ? `${int}.${frac}` : int;
}
export function toUnits(v: string, decimals: number): bigint | null {
  const t = v.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  try { return parseUnits(t, decimals); } catch { return null; }
}
export const usd = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? "…" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 6 : 2 });
export const compact = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? "…" : n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
export const pct = (n: number | null | undefined) => (n == null || !isFinite(n) ? "…" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);

export const etherscanTx = (h: string) => `https://etherscan.io/tx/${h}`;
export const etherscanAddr = (a: string) => `https://etherscan.io/address/${a}`;
export const etherscanToken = (a: string) => `https://etherscan.io/token/${a}`;
const solSuffix = (c: Cluster) => (c === "devnet" ? "?cluster=devnet" : "");
export const solscanTx = (s: string, c: Cluster = "mainnet") => `https://solscan.io/tx/${s}${solSuffix(c)}`;
export const solscanAccount = (a: string, c: Cluster = "mainnet") => `https://solscan.io/account/${a}${solSuffix(c)}`;
export const solscanToken = (a: string, c: Cluster = "mainnet") => `https://solscan.io/token/${a}${solSuffix(c)}`;

export const errMsg = (e: unknown) => {
  const m = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e);
  return m.split("\n")[0];
};
export const declined = (m: string) => /reject|denied|declin|cancel/i.test(m);
