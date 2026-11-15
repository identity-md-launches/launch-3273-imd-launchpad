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
export interface Launched { mint: string; name: string; symbol: string; image: string; description?: string; cluster: "devnet" | "mainnet"; creator: string; at: number; signatures: string[]; project?: string }
export interface SwarmOrder { tx: string; fp: string; service: string; label: string; objective: string; at: number; payer: string; mint?: string; jobId?: string; project?: string }

/**
 * A project is the shared local ID of one Launch + Build session. Token launch and Swarm jobs each
 * record it, so jobs paid before the mint exists still land in that token's Studio.
 */
export const newProjectId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const mintForProject = (project: string) => read<Launched[]>("launched", []).find((l) => l.project === project)?.mint;
/** After a launch: give every earlier job of the same project the new mint. Runs on its own; neither track waits for it. */
export function attachMint(project: string, mint: string) {
  const orders = read<SwarmOrder[]>("swarm-orders", []);
  if (orders.some((o) => o.project === project && !o.mint)) write("swarm-orders", orders.map((o) => (o.project === project && !o.mint ? { ...o, mint } : o)));
}
/** Does a job belong to this token's Studio: by mint, by shared project, or (orders saved before project IDs) by the token named in its brief. */
export function belongsTo(o: SwarmOrder, mint: string, l?: Launched) {
  if (o.mint) return o.mint === mint;
  if (l?.project && o.project) return o.project === l.project;
  return !!l && !o.project && o.at <= l.at && o.objective.includes(`token is ${l.name} (${l.symbol.toUpperCase()})`);
}

/** Toast-like status line announced to screen readers. */
type Note = { text: string; href?: string } | null;
let noteSet: ((n: Note) => void) | null = null;
export const bindNote = (f: (n: Note) => void) => { noteSet = f; };
export const notify = (text: string, href?: string) => noteSet?.({ text, href });
