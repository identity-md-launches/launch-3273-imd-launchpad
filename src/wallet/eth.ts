import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { ETH_RPC, SITE_NAME } from "../config";

/** Browser wallets by EIP-6963 (MetaMask, Rabby and any other extension, by their own names), then Coinbase. No relay, no project ID. */
export const wagmiConfig = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
  transports: { [mainnet.id]: http(ETH_RPC) },
});

export const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

/** IMD Intakev2: request() pays and records a job, priceOf() is the official fee. */
export const INTAKE_ABI = [
  {
    type: "function", name: "request", stateMutability: "nonpayable",
    inputs: [
      { name: "action", type: "bytes32" }, { name: "body", type: "bytes" },
      { name: "callback", type: "tuple", components: [{ name: "target", type: "address" }, { name: "selector", type: "bytes4" }] },
      { name: "asset", type: "address" }, { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "requestId", type: "bytes32" }],
  },
  { type: "function", name: "priceOf", stateMutability: "view", inputs: [{ name: "action", type: "bytes32" }, { name: "asset", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Wallets the brief names for Ethereum, matched to EIP-6963 rdns. */
export const NAMED_ETH = [
  { id: "metamask", name: "MetaMask", rdns: ["io.metamask", "io.metamask.flask"], install: "https://metamask.io/download/" },
  { id: "rabby", name: "Rabby", rdns: ["io.rabby"], install: "https://rabby.io/" },
];

export const OPEN_IN: ReadonlyArray<{ id: string; name: string; chain: "ethereum" | "solana"; href: (url: string) => string }> = [
  // https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks
  { id: "metamask", name: "MetaMask", chain: "ethereum", href: (u) => `https://link.metamask.io/dapp/${u.replace(/^https?:\/\//, "")}` },
  { id: "rabby", name: "Rabby", chain: "ethereum", href: (u) => `https://go.rabby.io/mobile/dapp?url=${encodeURIComponent(u)}` },
  // https://docs.cdp.coinbase.com/wallet-sdk/docs/deep-link
  { id: "coinbase", name: "Coinbase Wallet", chain: "ethereum", href: (u) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(u)}` },
  // https://docs.phantom.com/phantom-deeplinks/other-methods/browse
  { id: "phantom", name: "Phantom", chain: "solana", href: (u) => `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}` },
  // https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse
  { id: "solflare", name: "Solflare", chain: "solana", href: (u) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}` },
];

export const isMobileBrowser = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as unknown as { ethereum?: unknown }).ethereum && !(window as unknown as { solana?: unknown }).solana;
