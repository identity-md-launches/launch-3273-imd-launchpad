import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { App } from "./App";
import "./base.css";
import "./additions.css";
import { wagmiConfig } from "./wallet/eth";
import { SolanaProvider } from "./wallet/solana";
import { WalletRoot } from "./wallet/WalletSheet";

const qc = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <SolanaProvider>
          <WalletRoot><App /></WalletRoot>
        </SolanaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
