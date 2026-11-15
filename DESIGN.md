# IMD Launchpad design system

Taken from the final source: `src/base.css` (the live site's stylesheet, kept as is so the design and
branding carry over), `src/additions.css` (swap, toast, header and tab additions on the same tokens)
and the components in `src/`.

## Character

Dark, quiet and dense: one lime accent on near-black gray surfaces. Data first, tabular numbers,
no gradients on text, no eyebrows or tracked capitals, no motion beyond a 150 ms press feedback.

## Color tokens (`:root` in `src/base.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` (`--gray-950`) | `#0c0f14` | Page, inputs, code blocks |
| `--color-surface` (`--gray-900`) | `#141922` | Cards, sheets, token rows |
| `--color-surface-raised` (`--gray-850`) | `#1c2230` | Buttons, pills, chosen options, toast |
| `--color-surface-hover` (`--gray-800`) | `#242b3a` | Sheet row hover |
| `--color-border` (`--gray-700`) | `#2e3646` | All 1px borders and dividers |
| `--color-text` (`--gray-50`) | `#eef1f6` | Body text |
| `--color-text-secondary` (`--gray-400`) | `#a1abbc` | Hints, labels, muted copy |
| `--color-accent` / `--color-focus` (`--lime-400`) | `#b8f25c` | Primary buttons, links, focus ring, progress |
| `--color-accent-hover` (`--lime-300`) | `#cdf78a` | Primary hover |
| `--color-on-accent` | `#0c0f14` | Text on lime |
| `--color-error` (`--coral-300`) | `#ff9e92` | Errors, price down, blocked jobs |
| `--color-warning` (`--amber-300`) | `#f5c86b` | Mainnet banner, high slippage, executing jobs |
| `--color-success` (`--teal-300`) | `#7fd9c0` | Price up, completed jobs, Solana dot |
| `--violet-300` | `#b9a7ff` | Ethereum chain dot, chart bar 5 |

Chain dots: `.chain-eth` violet, `.chain-sol` teal. Split bars use `.bar-0` to `.bar-4`
(lime, teal, amber, coral, violet). Dark only (`color-scheme: dark`); there is no light theme.

Contrast computed from the token pairs (WCAG formula, not rendered): text on bg 16.95:1, text on
surface 15.56:1, secondary on bg 8.29:1, secondary on surface 7.61:1, secondary on raised 6.86:1,
on-accent on accent 14.53:1, accent on surface 13.33:1, error on surface 8.86:1, warning on
raised 10.11:1, success on surface 10.56:1.

## Typography

- Families: `--font-sans` system UI stack (ui-sans-serif, system-ui, -apple-system, Segoe UI,
  Roboto…); `--font-mono` (ui-monospace, SF Mono…) only for `.code` request previews.
- Scale (six sizes): `--text-sm` 0.875rem, `--text-base` 1rem, `--text-lg` 1.125rem,
  `--text-xl` 1.5rem, `--text-2xl` 2rem, `--text-display` 2.5rem (3.5rem from 60rem wide).
- h1 display, weight 700, line-height 1.05, letter-spacing -0.035em; `.page-title` xl then 2xl
  at 60rem; h2 lg/1.3; h3 base/600. Body 1rem/1.55. Headings use `text-wrap: balance`, paragraphs
  `pretty`. Numbers use `.num` (tabular-nums). Long addresses use `.mono-wrap` (wrap anywhere).

## Spacing, radius, layout

- Spacing: `--space-1` 0.25rem, `-2` 0.5, `-3` 0.75, `-4` 1, `-6` 1.5, `-8` 2, `-12` 3, `-20` 5rem.
- Radius: `--radius-control` 8px (controls), `--radius-card` 14px (cards, sheets); pills 999px.
- `.wrap` max 72rem with `--gutter` 1rem, 1.5rem from 40rem, 2rem from 60rem.
- Breakpoints: 22.5rem (tiny labels hide), 30rem (brand text and the header Swarm button hide below),
  40rem (cards pad 1.5rem, grids go to columns, sheet centers), 60rem (hero and `.token-grid`
  go two-column, display size grows).
- Logical properties throughout (`inline-size`, `margin-inline`, `inset-block-end`).

## Components

- **Header**: brand mark + name, "Build with IMD Swarm" button (30rem+), one wallet control;
  scrollable `.nav` of eight hash links with a lime underline on `aria-current="page"`.
- **Mainnet banner** (`.banner`) when the Solana launch network is mainnet.
- **Buttons** `.button` (44px min, raised), `.button-primary` (lime), `.button-quiet`,
  `.button-small` (36px), `.button-wide`, `.link-button`, `.icon-button` (44px, star toggle);
  `aria-pressed` buttons get a lime border. States: hover (border lightens), active (scale .96,
  removed under reduced motion), disabled (60% opacity), focus-visible (2px lime ring, 2px offset).
- **Card** `.card`: surface, 1px border, 14px radius, 1rem/1.5rem padding.
- **Fields** `.field` with label above, `.hint`, `.error` bound by `aria-describedby`,
  `aria-invalid` turns the border coral. `.choice` checkbox tiles highlight when checked.
- **Wallet sheet** (`.sheet-bg` + `.sheet`): bottom sheet under 40rem, centered above, max 420px,
  48px `.sheet-row` rows with 28px marks; Ethereum group (EIP-6963 wallets, Coinbase, MetaMask /
  Rabby install rows, or "Open in" rows on phones) and Solana group (Phantom, Solflare), account
  panels with balance, network switch and disconnect, then recent transactions. Escape, backdrop
  and × close it.
- **Flow** (`.flow`): numbered steps with done/now/stop states and explorer links; used for Swarm
  payment and swap status.
- **Swap card**: amount input + token select row (`.swap-row`), flip button, slippage chips with a
  custom field, `.facts` list for route, network, rate, minimum, impact, fees and time.
- **Token rows** (`.token-row`): image, name, price, 24h change (`.up`/`.down`), market cap and
  volume (hidden under 40rem), watch star. Skeleton rows while loading.
- **Stats** (`.stats`): 2 columns, 4 from 40rem. **Progress** bar for the bonding curve.
- **Split bar** + `.split-list` for PIMD and revenue allocations, with wallet or "not published".
- **Toast** (`.toast`): bottom status line, `role="status"`, clears after 8 s.

## Responsive behavior

At 390 wide the first screen holds the header, the h1 "Idea in. Ecosystem out.", one line of lede,
the "Build with IMD Swarm" button and the Launch + build card with its first fields. Grids
collapse to one column below 40rem; the hero and detail pages split into two columns from 60rem.
The wallet sheet becomes a bottom sheet under 40rem. The nav scrolls horizontally instead of
wrapping. Rendered layout was not inspected in a browser (see README, Validation).
