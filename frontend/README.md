# Tokamak Agent Layer — Frontend

Next.js 14 frontend for the **Tokamak Agent Layer (TAL)** — a web interface for discovering, registering, and managing trustless AI agents on the Tokamak Network.

## Overview

This frontend provides a complete user interface for interacting with the TAL protocol on Optimism Sepolia:

- **Agent Discovery** — Browse, search, and filter registered AI agents
- **Agent Registration** — Register new agents with ERC-8004 compliant metadata
- **Agent Detail View** — View agent identity, operator status, feedback, and validation data
- **Reputation Dashboard** — View standard, stake-weighted, and verified reputation scores
- **Validation Registry** — Browse validation requests across all trust models
- **Staking Interface** — Stake/unstake TON with cross-layer bridge information
- **Wallet Integration** — RainbowKit + wagmi for seamless wallet connection

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 14](https://nextjs.org/) (App Router) |
| Language | TypeScript (strict mode) |
| Styling | [Tailwind CSS 3](https://tailwindcss.com/) |
| Web3 | [wagmi 2](https://wagmi.sh/) + [viem 2](https://viem.sh/) |
| Wallet | [RainbowKit 2](https://www.rainbowkit.com/) |
| Data Fetching | [TanStack React Query 5](https://tanstack.com/query) |
| Charts | [Recharts 2](https://recharts.org/) |
| Icons | [Lucide React](https://lucide.dev/) |
| Fonts | Inter (sans) + JetBrains Mono (mono) |

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Installation

```bash
# Install dependencies (use --legacy-peer-deps due to eslint version conflict)
npm install --legacy-peer-deps
```

### Environment Variables

Create a `.env.local` file:

```env
# WalletConnect Project ID (get one at https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLET_CONNECT_ID=your_project_id_here
```

> The app works without a WalletConnect project ID (uses "placeholder"), but wallet connection to external wallets will be limited.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Pages

| Route | Type | Description |
|-------|------|-------------|
| `/` | Static | Landing page with hero, features, and protocol stats |
| `/agents` | Client | Agent discovery with search, filter, and paginated list |
| `/agents/[id]` | Dynamic | Agent detail view with identity, stats, and actions |
| `/agents/register` | Client | Multi-step agent registration form |
| `/reputation/[agentId]` | Dynamic | Reputation dashboard with 3 scoring models |
| `/validation` | Client | Validation registry with trust model overview |
| `/validation/[hash]` | Dynamic | Validation request detail with timeline |
| `/staking` | Client | Staking interface with stake/unstake and bridge info |

## Architecture

```
frontend/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout (fonts, providers, navbar, footer)
│   │   ├── page.tsx                  # Landing page
│   │   ├── providers.tsx             # wagmi + RainbowKit + React Query providers
│   │   ├── globals.css               # Global styles + Tailwind directives
│   │   ├── agents/
│   │   │   ├── page.tsx              # Agent discovery list
│   │   │   ├── [id]/page.tsx         # Agent detail view
│   │   │   └── register/page.tsx     # Agent registration form
│   │   ├── reputation/
│   │   │   └── [agentId]/page.tsx    # Reputation dashboard
│   │   ├── validation/
│   │   │   ├── page.tsx              # Validation registry
│   │   │   └── [hash]/page.tsx       # Validation detail
│   │   └── staking/
│   │       └── page.tsx              # Staking interface
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx            # Sticky nav with wallet connect button
│   │   │   └── Footer.tsx            # Footer with links
│   │   ├── AgentCard.tsx             # Agent list item card
│   │   ├── ReputationChart.tsx       # Reputation bar + summary components
│   │   ├── StatusBadge.tsx           # Validation status badge
│   │   └── ValidationTimeline.tsx    # Validation step timeline
│   ├── hooks/
│   │   ├── useAgent.ts              # Agent identity contract reads
│   │   ├── useReputation.ts         # Reputation contract reads
│   │   ├── useValidation.ts         # Validation contract reads
│   │   └── useWallet.ts             # Wallet connection + chain check
│   └── lib/
│       ├── contracts.ts             # Contract addresses + chain config
│       └── utils.ts                 # Utility functions (formatting, labels)
├── next.config.js                   # Next.js config (IPFS image domains, webpack fallbacks)
├── tailwind.config.ts               # Tailwind config (Tokamak color palette, fonts)
├── tsconfig.json                    # TypeScript config (ES2020, strict)
├── postcss.config.js                # PostCSS config
└── package.json
```

## Hooks

The frontend uses custom React hooks built on wagmi's `useReadContract` to interact with deployed contracts:

### `useAgent.ts`

```typescript
// Get a single agent's identity data
const { agent, isLoading } = useAgent(agentId);

// Get total registered agent count
const { count, isLoading } = useAgentCount();

// Get all agent IDs for an owner address
const { agentIds, isLoading } = useAgentsByOwner(ownerAddress);
```

### `useReputation.ts`

```typescript
// Get feedback count for an agent
const { count, isLoading } = useFeedbackCount(agentId);

// Get unique client addresses that provided feedback
const { clients, isLoading } = useClientList(agentId);

// Get aggregated reputation summary
const { summary, isLoading } = useReputationSummary(agentId, clients);

// Get a reviewer's reputation score
const { reputation, isLoading } = useReviewerReputation(reviewerAddress);
```

### `useValidation.ts`

```typescript
// Get all validation hashes for an agent
const { validationHashes, isLoading } = useAgentValidations(agentId);

// Get validation request + response details
const { validation, isLoading } = useValidation(requestHash);

// Get count of pending validations
const { count, isLoading } = usePendingValidationCount(agentId);

// Check if a validation is disputed
const { isDisputed, isLoading } = useIsDisputed(requestHash);
```

### `useWallet.ts`

```typescript
// Get wallet connection state + chain check
const { address, isConnected, isCorrectChain, chainId } = useWallet();
```

## Contract Integration

The frontend reads directly from deployed contracts on Optimism Sepolia using ABIs imported from the SDK:

| Contract | Address | Used By |
|----------|---------|---------|
| TALIdentityRegistry | `0x3f89CD27fD877827E7665A9883b3c0180E22A525` | `useAgent` hooks |
| TALReputationRegistry | `0x0052258E517835081c94c0B685409f2EfC4D502b` | `useReputation` hooks |
| TALValidationRegistry | `0x09447147C6E75a60A449f38532F06E19F5F632F3` | `useValidation` hooks |
| StakingIntegrationModule | `0x41FF86643f6d550725177af1ABBF4db9715A74b8` | Staking page (future) |

ABIs are shared from the SDK package at `../sdk/src/abi/`.

## Theming

The frontend uses a custom **Tokamak** color palette defined in `tailwind.config.ts`:

```
tokamak-50  → #eff6ff  (lightest)
tokamak-500 → #2563eb  (primary)
tokamak-600 → #1d4ed8  (primary hover)
tokamak-900 → #172554  (darkest)
```

Additional accent colors: `teal (#14b8a6)`, `purple (#8b5cf6)`, `amber (#f59e0b)`.

CSS utility classes used throughout:

| Class | Usage |
|-------|-------|
| `btn-primary` | Primary action buttons |
| `btn-secondary` | Secondary action buttons |
| `card` | Card containers with padding + border |
| `badge-success` | Green status badges |
| `badge-warning` | Amber status badges |
| `badge-error` | Red status badges |
| `badge-info` | Blue info badges |

## Utility Functions

`src/lib/utils.ts` provides:

| Function | Description |
|----------|-------------|
| `cn(...inputs)` | Merge Tailwind classes (clsx + twMerge) |
| `shortenAddress(addr, chars?)` | `0x1234...5678` format |
| `formatScore(score)` | Display score or "N/A" |
| `formatBigInt(value, decimals?)` | Format BigInt with decimal places |
| `formatDate(date)` | Localized date string |
| `getValidationModelLabel(model)` | Model enum to human-readable label |
| `getValidationStatusLabel(status)` | Status enum to human-readable label |
| `getStatusColor(status)` | Status to badge CSS class |

## Wallet Connection

The app uses **RainbowKit** for wallet connection with the following configuration:

- **Network**: Optimism Sepolia (chain ID 11155420)
- **Transport**: Default HTTP RPC
- **SSR**: Enabled for Next.js compatibility
- **Query Config**: 60s stale time, no refetch on window focus

Wallet state is checked on every page that requires interaction. Users see warnings when:
- Wallet is not connected
- Connected to the wrong chain

## Build Output

```
Route (app)                              Size     First Load JS
┌ ○ /                                    179 B          98.9 kB
├ ○ /agents                              2.62 kB        146 kB
├ ƒ /agents/[id]                         1.7 kB         151 kB
├ ○ /agents/register                     6.57 kB        105 kB
├ ƒ /reputation/[agentId]                2.89 kB        148 kB
├ ○ /staking                             6.1 kB         96.1 kB
├ ○ /validation                          4.88 kB        140 kB
└ ƒ /validation/[hash]                   1.93 kB        147 kB

○ = Static (prerendered)
ƒ = Dynamic (server-rendered on demand)
```

## Known Build Warnings

The following warnings during build are expected and harmless:

- **`@react-native-async-storage/async-storage`** — MetaMask SDK includes React Native imports that are unused in web builds
- **`pino-pretty`** — Optional logging dependency from WalletConnect
- **`punycode` deprecation** — Node.js internal module deprecation, no action needed
- **Reown Config 403** — WalletConnect project config fetch fails with placeholder project ID

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Set the environment variable `NEXT_PUBLIC_WALLET_CONNECT_ID` in your Vercel project settings.

### Docker

```dockerfile
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
```

## Limitations (MVP)

- **Agent Registration** — IPFS upload and contract transaction not yet wired (form builds the registration file but logs to console)
- **Search/Filter** — Search bar is UI-only; full-text search requires subgraph (Sprint 3)
- **Staking Actions** — Stake/unstake buttons are present but not connected to contracts
- **Reputation Scores** — Dashboard shows structure but live score calculation depends on subgraph
- **Feedback Submission** — Submit Feedback button on agent detail page is not yet functional
- **Governance Page** — Listed in spec but not yet implemented
- **Mobile Navigation** — Navigation links are hidden on mobile (hamburger menu not yet added)

## License

MIT
