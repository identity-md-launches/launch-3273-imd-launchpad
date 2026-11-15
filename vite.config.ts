import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset URL relative so the export works at an IPFS gateway subpath or ENS name.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { global: "globalThis" },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000, sourcemap: false },
});
