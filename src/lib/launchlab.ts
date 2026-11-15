/**
 * Raydium LaunchLab through Raydium's own SDK, loaded only when a visitor launches or trades.
 * Standard SOL curve config: 1,000,000,000 supply, 6 decimals, graduation to a Raydium AMM pool.
 * Mint and freeze authorities are revoked by the LaunchLab program at creation.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { LAUNCH_DECIMALS, type Cluster } from "../config";
import { connectionFor, type SolProvider } from "../wallet/solana";

const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
const SLIPPAGE_BPS = 100;
const sdk = () => import("@raydium-io/raydium-sdk-v2");

async function programId(c: Cluster) { const s = await sdk(); return c === "devnet" ? s.DEV_LAUNCHPAD_PROGRAM : s.LAUNCHPAD_PROGRAM; }
async function load(c: Cluster, w: SolProvider) {
  const s = await sdk();
  return s.Raydium.load({
    connection: connectionFor(c), cluster: c === "devnet" ? "devnet" : "mainnet", owner: new PublicKey(w.publicKey!.toBase58()),
    signAllTransactions: (txs) => w.signAllTransactions(txs), disableLoadToken: true, disableFeatureCheck: true,
  });
}

export interface PoolState { poolId: string; status: number; graduated: boolean; creator: string; priceSol: number; progress: number; raisedSol: number; targetSol: number }
export async function readPool(c: Cluster, mint: string): Promise<PoolState | null> {
  const s = await sdk();
  const pid = await programId(c);
  const poolId = s.getPdaLaunchpadPoolId(pid, new PublicKey(mint), WSOL).publicKey;
  const info = await connectionFor(c).getAccountInfo(poolId);
  if (!info) return null;
  const p = s.LaunchpadPool.decode(info.data);
  const dec = Number(p.mintDecimalsA ?? LAUNCH_DECIMALS);
  const vA = Number(p.virtualA.toString()), vB = Number(p.virtualB.toString()), rA = Number(p.realA.toString()), rB = Number(p.realB.toString());
  const target = Number(p.totalFundRaisingB.toString());
  return {
    poolId: poolId.toBase58(), status: Number(p.status), graduated: Number(p.status) > 0, creator: p.creator.toBase58(),
    priceSol: (vB + rB) / 1e9 / ((vA - rA) / 10 ** dec), progress: target ? Math.min(1, rB / target) : 0, raisedSol: rB / 1e9, targetSol: target / 1e9,
  };
}

export async function createToken(c: Cluster, w: SolProvider, t: { name: string; symbol: string; uri: string; buyLamports: bigint }) {
  const s = await sdk();
  const raydium = await load(c, w);
  const pid = await programId(c);
  const mint = Keypair.generate();
  const configId = s.getPdaLaunchpadConfigId(pid, WSOL, 0, 0).publicKey;
  const cfg = await connectionFor(c).getAccountInfo(configId);
  if (!cfg) throw new Error("LaunchLab's standard SOL curve config isn't on this network.");
  const buy = t.buyLamports > 0n;
  const { execute, extInfo } = await raydium.launchpad.createLaunchpad({
    programId: pid, mintA: mint.publicKey, decimals: LAUNCH_DECIMALS, name: t.name, symbol: t.symbol, uri: t.uri,
    migrateType: "amm", configId, configInfo: s.LaunchpadConfig.decode(cfg.data), mintBDecimals: 9,
    txVersion: s.TxVersion.V0, slippage: new BN(SLIPPAGE_BPS), buyAmount: new BN((buy ? t.buyLamports : 1n).toString()), createOnly: !buy, extraSigners: [mint],
  } as never);
  const res = await execute({ sequentially: true });
  return { mint: mint.publicKey.toBase58(), poolId: extInfo.address.poolId.toBase58(), signatures: res.txIds as string[] };
}

/** Buy with lamports or sell token base units on the bonding curve. */
export async function trade(c: Cluster, w: SolProvider, mint: string, side: "buy" | "sell", amount: bigint) {
  const s = await sdk();
  const raydium = await load(c, w);
  const base = { programId: await programId(c), mintA: new PublicKey(mint), slippage: new BN(SLIPPAGE_BPS), txVersion: s.TxVersion.V0 };
  const built = side === "buy"
    ? await raydium.launchpad.buyToken({ ...base, buyAmount: new BN(amount.toString()) } as never)
    : await raydium.launchpad.sellToken({ ...base, sellAmount: new BN(amount.toString()) } as never);
  const { txId } = await built.execute({ sendAndConfirm: true });
  return txId as string;
}

/** Metaplex-style metadata JSON, generated from the form. */
export function buildMetadata(f: { name: string; symbol: string; description: string; image: string; website: string; x: string; telegram: string }) {
  const ext: Record<string, string> = {};
  if (f.website) ext.website = f.website;
  if (f.x) ext.twitter = f.x.startsWith("http") ? f.x : `https://x.com/${f.x.replace(/^@/, "")}`;
  if (f.telegram) ext.telegram = f.telegram.startsWith("http") ? f.telegram : `https://t.me/${f.telegram.replace(/^@/, "")}`;
  return { name: f.name.trim(), symbol: f.symbol.trim().toUpperCase(), description: f.description.trim(), image: f.image.trim(), showName: true, createdOn: "IMD Launchpad", extensions: ext, properties: { files: f.image ? [{ uri: f.image.trim(), type: "image/png" }] : [], category: "image" } };
}
