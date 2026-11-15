import { Connection, PublicKey, VersionedTransaction, type Transaction } from "@solana/web3.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_CLUSTER, solRpc, type Cluster } from "../config";
import { read, write } from "../lib/store";

/** The surface Phantom and Solflare both inject. Keys never leave the wallet. */
export interface SolProvider {
  publicKey: { toBase58(): string } | null;
  isPhantom?: boolean;
  isSolflare?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<unknown>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
  on?(ev: string, cb: (...a: unknown[]) => void): void;
  off?(ev: string, cb: (...a: unknown[]) => void): void;
}
export type SolWalletId = "phantom" | "solflare";
export const SOL_WALLETS: { id: SolWalletId; name: string; install: string; get: () => SolProvider | undefined }[] = [
  { id: "phantom", name: "Phantom", install: "https://phantom.com/download", get: () => { const w = window as unknown as { phantom?: { solana?: SolProvider }; solana?: SolProvider }; return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : undefined); } },
  { id: "solflare", name: "Solflare", install: "https://solflare.com/download", get: () => { const w = window as unknown as { solflare?: SolProvider }; return w.solflare?.isSolflare ? w.solflare : undefined; } },
];

const conns = new Map<Cluster, Connection>();
export const connectionFor = (c: Cluster) => {
  if (!conns.has(c)) conns.set(c, new Connection(solRpc(c), "confirmed"));
  return conns.get(c)!;
};

interface Sol {
  address: string | null; provider: SolProvider | null; wallet: SolWalletId | null;
  cluster: Cluster; setCluster(c: Cluster): void; connection: Connection;
  connect(id: SolWalletId): Promise<void>; disconnect(): Promise<void>;
  pending: SolWalletId | null; error: string;
}
const Ctx = createContext<Sol | null>(null);

export function SolanaProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<SolWalletId | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [cluster, setClusterState] = useState<Cluster>(() => read("cluster", DEFAULT_CLUSTER));
  const [pending, setPending] = useState<SolWalletId | null>(null);
  const [error, setError] = useState("");
  const provider = wallet ? SOL_WALLETS.find((w) => w.id === wallet)!.get() ?? null : null;

  const connect = useCallback(async (id: SolWalletId, silent = false) => {
    const p = SOL_WALLETS.find((w) => w.id === id)!.get();
    if (!p) { if (!silent) setError(`${id === "phantom" ? "Phantom" : "Solflare"} isn't installed in this browser.`); return; }
    setError(""); if (!silent) setPending(id);
    try {
      await p.connect(silent && id === "phantom" ? { onlyIfTrusted: true } : undefined);
      if (!p.publicKey) throw new Error("The wallet didn't share an address.");
      setWallet(id); setAddress(p.publicKey.toBase58()); write("sol-wallet", id);
    } catch (e) {
      if (!silent) setError(/reject|denied|cancel/i.test(String((e as Error)?.message ?? e)) ? "You declined in your wallet." : `Couldn't connect: ${(e as Error)?.message ?? e}`);
    } finally { setPending(null); }
  }, []);
  const disconnect = useCallback(async () => {
    try { await provider?.disconnect(); } catch { /* already gone */ }
    setWallet(null); setAddress(null); write("sol-wallet", null);
  }, [provider]);

  useEffect(() => { const last = read<SolWalletId | null>("sol-wallet", null); if (last === "phantom") void connect(last, true); }, [connect]);
  useEffect(() => {
    if (!provider?.on) return;
    const onChange = (pk: unknown) => { const k = pk as PublicKey | null; if (k) setAddress(k.toBase58()); else if (provider.publicKey) setAddress(provider.publicKey.toBase58()); };
    const onDisc = () => { setWallet(null); setAddress(null); };
    provider.on("accountChanged", onChange); provider.on("disconnect", onDisc);
    return () => { provider.off?.("accountChanged", onChange); provider.off?.("disconnect", onDisc); };
  }, [provider]);

  const setCluster = (c: Cluster) => { setClusterState(c); write("cluster", c); };
  const value = useMemo<Sol>(() => ({ address, provider, wallet, cluster, setCluster, connection: connectionFor(cluster), connect: (id) => connect(id), disconnect, pending, error }), [address, provider, wallet, cluster, connect, disconnect, pending, error]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSolana = () => { const c = useContext(Ctx); if (!c) throw new Error("SolanaProvider missing"); return c; };

/** Sign with the wallet, send through the site's RPC, and wait for confirmation. */
export async function signSendConfirm(provider: SolProvider, connection: Connection, tx: VersionedTransaction): Promise<string> {
  const signed = await provider.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
  const bh = await connection.getLatestBlockhash();
  const res = await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  if (res.value.err) throw new Error(`The transaction failed on Solana: ${JSON.stringify(res.value.err)}`);
  return sig;
}
