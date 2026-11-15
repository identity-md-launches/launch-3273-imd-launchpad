import { useEffect, useState } from "react";

/** Small localStorage store shared across components (same key = same state). */
const subs = new Map<string, Set<() => void>>();
export function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(`imd:${key}`); return v == null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
}
export function write<T>(key: string, v: T) {
  try { localStorage.setItem(`imd:${key}`, JSON.stringify(v)); } catch { /* storage full or blocked */ }
  subs.get(key)?.forEach((f) => f());
}
export function useStored<T>(key: string, fallback: T): [T, (u: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    const f = () => setV(read(key, fallback));
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key)!.add(f);
    return () => { subs.get(key)!.delete(f); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (u: T | ((p: T) => T)) => write(key, typeof u === "function" ? (u as (p: T) => T)(read(key, fallback)) : u);
  return [v, set];
}

/** Every transaction the site sends, kept on this device as the visitor's history. */
export interface TxRecord { id: string; chain: "ethereum" | "solana"; cluster?: "devnet" | "mainnet"; kind: string; label: string; at: number; status: "pending" | "confirmed" | "failed"; account: string }
export function logTx(r: Omit<TxRecord, "at"> & { at?: number }) {
  const list = read<TxRecord[]>("tx-history", []);
  const next = [{ ...r, at: r.at ?? Date.now() }, ...list.filter((x) => x.id !== r.id)].slice(0, 100);
  write("tx-history", next);
}
export function updateTx(id: string, status: TxRecord["status"]) {
  write("tx-history", read<TxRecord[]>("tx-history", []).map((x) => (x.id === id ? { ...x, status } : x)));
}

/** A launched token, kept so its Studio can be reopened later. */
export interface Launched { mint: string; name: string; symbol: string; image: string; description?: string; cluster: "devnet" | "mainnet"; creator: string; at: number; signatures: string[] }
export interface SwarmOrder { tx: string; fp: string; service: string; label: string; objective: string; at: number; payer: string; mint?: string; jobId?: string }

/** Toast-like status line announced to screen readers. */
type Note = { text: string; href?: string } | null;
let noteSet: ((n: Note) => void) | null = null;
export const bindNote = (f: (n: Note) => void) => { noteSet = f; };
export const notify = (text: string, href?: string) => noteSet?.({ text, href });
