# IMD Launchpad

Idea in. Ecosystem out. A static, non-custodial dapp that upgrades the existing IMD Launchpad
(https://imd-launchpad-idea-in-ecosy-df03.imd.site/) in place: same design, branding and pages, plus
multi-chain swap, a unified Launch + Build with Swarm workflow, multi-job Swarm payment, a Project
Studio, and both Ethereum and Solana wallets.

The live site shipped only a compiled bundle. This repository rebuilds it as Vite + React +
TypeScript source. Its stylesheet is kept verbatim in `src/base.css`, and its contract addresses,
ABIs, API calls and LaunchLab calls were carried over and checked against the chain.

## Install, preview, rebuild

```sh
npm ci              # install from package-lock.json
npm run dev         # local dev server
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production export to dist/
npm run preview     # serve dist/ locally
```

`dist/` is committed and uses only relative URLs (`base: "./"`), so it works at an IPFS gateway
subpath or an ENS name. Routing is by hash (`#/swap`, `#/token/<mint>`…), so no server rewrites are needed.

## What it does

| Page | Route | Integration |
| --- | --- | --- |
| Launch + build | `#/` | Token form → Raydium LaunchLab `createLaunchpad` via `@raydium-io/raydium-sdk-v2` (devnet or mainnet), alongside an independent Swarm checkout |
| Swap | `#/swap` | KyberSwap Aggregator (Ethereum), Jupiter (Solana), LI.FI (Ethereum ↔ Solana) |
| Swarm | `#/swarm` | IMD Intakev2 `priceOf` / `request` on Ethereum, job tracking on api.imd.fun |
| Discover / token | `#/discover`, `#/token/<mint>` | DexScreener market data and chart, LaunchLab curve buy/sell, watchlist |
| Studio | `#/studio[/<mint>]` | Per-project token, jobs, deliverables, continue and hire again |
| Portfolio / creator | `#/portfolio`, `#/creator/<addr>` | SPL holdings, IMD balance, transaction history |
| PIMD | `#/pimd` | Proposed distribution; trading opens once the mint is published |
| Revenue | `#/rewards` | Revenue split, IMD supply read on-chain |

Verified addresses (`src/config.ts`, `src/lib/swap.ts`): IMD `0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7`,
IMD Intakev2 `0xa43e6f75ee006411f79ac1c84120606c2330de82` (its `priceOf(job.open, IMD)` returned
0.5 IMD during validation). USDC/USDT on Ethereum and Solana use the issuers' canonical addresses.
The site refuses to pay if the intake ever asks anything other than 0.5 IMD.

Swarm services map to live skills from `api.imd.fun/skills`: build-website, build-contract-project,
audit-imported-code, create-image, create-audio, create-video and research-report. Each service is one
job. The total is fee × jobs, approved exactly (never unlimited), then each job is paid in its own
`request` signature. Identical briefs are fingerprinted, so a second payment needs an explicit
"Pay again" tick.

### Owner-settable values (`OWNER` in `src/config.ts`)

Empty until the IMD team supplies them. Screens that depend on them say "not published" or "not
deployed" instead of guessing: `pimdMint`, `pimdWallets`, `revenueWallets`, `metadataUploadUrl` and
`solanaMainnetRpc`.

## Validation (run on the worker, 2026-11-15)

- `npm run typecheck`: passed, no errors.
- `npm run build`: passed. `dist/` is 2.4 MB: the main chunk is about 938 kB (284 kB gzip), and the
  Raydium SDK is in a lazy `lib` chunk of about 772 kB that loads only when someone launches or trades.
- Interaction test (`test/scratch/run.ts`, bundled with esbuild and run in Node against live
  services): **all checks passed**.
  - Intake `priceOf(job.open, IMD)` = 0.5 IMD (`job.continue` is also 0.5 IMD).
  - IMD `totalSupply` is readable.
  - All 14 services map to skills on the live `/skills` list.
  - Request bodies, the bytes32 action and fingerprint dedupe all behave as expected.
  - Metadata is generated from the form.
  - Real quotes came back for 0.01 ETH→IMD (KyberSwap, uniswap-v4), 100 IMD→USDC (KyberSwap),
    0.1 SOL→USDC (Jupiter), 5 USDT→SOL (Jupiter), 1 SOL→IMD (LI.FI via NearIntents) and
    20 USDC Ethereum→USDC Solana (LI.FI via Relay).
  - A PIMD quote is refused with the "not deployed" explanation.
  - LI.FI returned USD prices for 7 assets.
  - `dist/index.html` has a title, description, og:title, og:image and favicon, and only relative URLs.
- Not performed:
  - Signing real transactions: no funded wallet or browser extension was available. That covers
    wallet connect, approve/request, the swap send path and a LaunchLab devnet launch.
  - Any rendered check. The design-critic probe (`taste.mjs`) could not run: Playwright installed
    outside the repo, but Chromium failed to start because the system library `libatk-1.0.so.0`
    is missing, and it can't be installed without root. No screenshots were made, the 390 px first
    screen was not visually confirmed, and console/overflow inspection was not done.

### Better Interface review (source-level, no browser)

Coverage: the without-a-browser checks of all six domains. Every "with a browser" check is **Not verified**.

- Accessibility: every control has a visible label or `aria-label`. Field errors are bound with
  `aria-describedby`/`aria-invalid`. Focus-visible ring is 2px lime. Skip link, `role="status"` toast,
  dialog with `aria-modal` and Escape. Reduced-motion guard on button press.
  *Finding fixed*: `src/pages/Discover.tsx` used `role="tablist"`/`role="tab"` without arrow-key
  handling. These are now `aria-pressed` toggle buttons in a labelled group.
  *Open*: the wallet sheet focuses its close button but does not trap focus (`src/wallet/WalletSheet.tsx`).
- Layout: logical properties, three breakpoints, one-column collapse.
  *Finding fixed*: the visible "Build with IMD Swarm" hero action was hidden under 40rem
  (`src/pages/Home.tsx`). It now shows at every width.
  *Fixed*: the swap token select narrows under 22.5rem so the amount field keeps room.
- Writing: plain sentences, directions next to their controls, unavailable states explain why
  (PIMD, missing wallets, no route).
  *Finding fixed*: LI.FI's "Integrator Fee" step was shown as a route hop (`src/lib/swap.ts`). Fee
  steps now appear only under fees.
- Typography: six sizes, descending headings, tabular numbers, balanced headings, long addresses
  wrap rather than overflow.
- Colors: every token pair computed at 6.86:1 or higher (see DESIGN.md). Dark theme only, inherited
  from the live site.
- UI: buttons define rest, hover, active, disabled and focus. Quotes, tokens and jobs have loading
  and empty states. Swap and payment flows show per-step status with explorer links.

## Limitations

- Token metadata: the site has no server. It generates the metadata JSON, but the visitor hosts it
  (IPFS/Arweave) and pastes the link, unless the team sets `metadataUploadUrl`.
- Comments, the watchlist, the Studio project list and transaction history are stored on this device
  only (localStorage). There is no shared backend.
- PIMD, its allocation wallets and the revenue wallets are not published, so PIMD trading, airdrops
  and executed revenue splits are unavailable and labelled that way.
- Public Solana mainnet RPC is rate-limited. Set `solanaMainnetRpc` for production traffic.
- LI.FI and Jupiter public endpoints are keyless and rate-limited.
