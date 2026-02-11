---
title: Setup
sidebar_position: 1
---

# Setup

This guide covers installing, configuring, and running the Tokamak AI Layer frontend application locally.

## Prerequisites

| Requirement | Minimum Version |
|-------------|----------------|
| Node.js | 20+ |
| npm or pnpm | npm 9+ / pnpm 8+ |
| WalletConnect Project ID | [cloud.walletconnect.com](https://cloud.walletconnect.com/) |
| Pinata API Keys | [app.pinata.cloud](https://app.pinata.cloud/) |

## Installation

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install
```

The frontend uses the following key dependencies:

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^14.2.0 | React framework with App Router |
| `react` | ^18.3.0 | UI library |
| `wagmi` | ^2.14.0 | React hooks for Ethereum |
| `viem` | ^2.21.0 | TypeScript Ethereum interface |
| `@rainbow-me/rainbowkit` | ^2.2.0 | Wallet connection UI |
| `@tanstack/react-query` | ^5.60.0 | Async state management |
| `recharts` | ^2.13.0 | Data visualization |
| `lucide-react` | ^0.460.0 | Icon library |
| `tailwindcss` | ^3.4.0 | Utility-first CSS |

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WALLET_CONNECT_ID` | Yes | WalletConnect project ID for RainbowKit wallet modal |
| `THANOS_RPC_URL` | No | Server-side RPC URL for agent resolution (defaults to `https://rpc.thanos-sepolia.tokamak.network`) |
| `PINATA_API_KEY` | Yes | Pinata API key for IPFS uploads during agent registration |
| `PINATA_SECRET_KEY` | Yes | Pinata secret key for IPFS uploads |
| `AGENT_RUNTIME_URL` | No | Fallback URL for agent runtime server (defaults to `http://localhost:3001`) |

:::tip Get a WalletConnect Project ID
Visit [cloud.walletconnect.com](https://cloud.walletconnect.com/), create a new project, and copy the Project ID into your `.env.local` file. Without this, the wallet connection modal will still render but may have limited functionality.
:::

## Chain Configuration

The frontend is configured for two networks:

| Property | Thanos Sepolia (L2) | Sepolia (L1) |
|----------|---------------------|--------------|
| Chain ID | `111551119090` | `11155111` |
| Currency | TON (18 decimals) | ETH (18 decimals) |
| RPC URL | `https://rpc.thanos-sepolia.tokamak.network` | Default public Sepolia RPC |
| Explorer | `https://explorer.thanos-sepolia.tokamak.network` | `https://sepolia.etherscan.io` |
| Purpose | Agent registration, reputation, validation | TON staking, token approvals |

Chain configuration is defined in [`frontend/src/app/providers.tsx`](/app/wallet-and-chains):

```typescript
const thanosSepolia = {
  id: 111551119090,
  name: 'Thanos Sepolia',
  nativeCurrency: {
    name: 'Tokamak Network Token',
    symbol: 'TON',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.thanos-sepolia.tokamak.network'] },
  },
  blockExplorers: {
    default: {
      name: 'Thanos Explorer',
      url: 'https://explorer.thanos-sepolia.tokamak.network',
    },
  },
  testnet: true,
} as const satisfies Chain;
```

## Running the Dev Server

```bash
npm run dev
```

The application will start on [http://localhost:3000](http://localhost:3000).

## Building for Production

```bash
# Build the production bundle
npm run build

# Start the production server
npm start
```

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `next dev` | Start development server with hot reload |
| `build` | `next build` | Build optimized production bundle |
| `start` | `next start` | Start production server |
| `lint` | `next lint` | Run ESLint checks |
| `typecheck` | `tsc --noEmit` | Run TypeScript type checking without emitting files |

:::warning Testnet Only
The current deployment targets Thanos Sepolia (L2) and Ethereum Sepolia (L1). All contract addresses, RPC URLs, and block explorers point to testnet infrastructure. Do not use mainnet tokens with this configuration.
:::
