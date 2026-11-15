/**
 * The site's single configuration file: chains, verified addresses, public endpoints and the
 * owner-settable values that only the IMD team can supply. An empty string means "not published":
 * every screen that depends on it says so instead of inventing a value.
 */
export const SITE_NAME = "IMD Launchpad";
export const SITE_DESCRIPTION = "Launch a Solana token, swap across Ethereum and Solana, and build the project with IMD Swarm.";

export type Cluster = "devnet" | "mainnet";
export const SOL_RPC: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};
export const DEFAULT_CLUSTER: Cluster = "devnet";
export const ETH_CHAIN_ID = 1;
export const ETH_RPC = "https://ethereum-rpc.publicnode.com";

export const IMD_API = "https://api.imd.fun";
export const IMD_EXPLORER = "https://explorer.imd.fun";

/** IMD on Ethereum mainnet (18 decimals). Read from the live site and checked on Etherscan. */
export const IMD_TOKEN = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7" as const;
/** IMD Intakev2: sells Swarm jobs for IMD. Its priceOf(action, IMD) is the official fee. */
export const IMD_INTAKE = "0xa43e6f75ee006411f79ac1c84120606c2330de82" as const;
/** The fee the site expects. If the intake ever asks a different amount, payment is refused. */
export const EXPECTED_JOB_FEE = 500000000000000000n; // 0.5 IMD

/** Token supply and decimals LaunchLab's standard curve mints. */
export const LAUNCH_SUPPLY = 1_000_000_000;
export const LAUNCH_DECIMALS = 6;

/** Swap aggregators: all public, keyless, called from the visitor's browser. */
export const KYBER_API = "https://aggregator-api.kyberswap.com/ethereum/api/v1";
export const JUPITER_API = "https://lite-api.jup.ag";
export const LIFI_API = "https://li.quest/v1";
export const LIFI_SOLANA_CHAIN = 1151111081099710;
export const DEXSCREENER_API = "https://api.dexscreener.com";

/**
 * Owner-settable values. Only the IMD team can supply these; until they do, the matching feature
 * reports itself as unavailable. Never fill them with placeholders.
 */
export const OWNER = {
  /** PIMD's Solana mint once its deployment is approved. Empty: PIMD is not deployed. */
  pimdMint: "",
  /** Solana addresses for PIMD's published allocation wallets. */
  pimdWallets: { publicLiquidity: "", airdrops: "", development: "", marketing: "", developerTreasury: "" },
  /** Ethereum addresses for the revenue split. Empty: not published yet. */
  revenueWallets: { treasury: "", operations: "", nftRewards: "", buybackBurn: "", developer: "" },
  /** A POST endpoint that pins token metadata JSON and returns {uri}. Empty: the visitor hosts it. */
  metadataUploadUrl: "",
  /** A private Solana mainnet RPC with browser CORS, if the team runs one. */
  solanaMainnetRpc: "",
};

export const solRpc = (c: Cluster) => (c === "mainnet" && OWNER.solanaMainnetRpc ? OWNER.solanaMainnetRpc : SOL_RPC[c]);
