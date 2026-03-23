'use client';

import { useReadContract, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '@/lib/NetworkContext';

const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';

const HyperliquidAdapterABI = [
  {
    type: 'function',
    name: 'getSubAccount',
    inputs: [{ name: 'vault', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultConfigs',
    inputs: [{ name: 'vault', type: 'address' }],
    outputs: [
      { name: 'subAccount', type: 'address' },
      { name: 'perpAsset', type: 'uint32' },
      { name: 'szDecimals', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
] as const;

// Known HyperliquidAdapter addresses per chain (multiple versions).
// Additional adapters can be added via NEXT_PUBLIC_HYPERLIQUID_ADAPTERS (comma-separated).
function getAdapterAddresses(chainId: number): `0x${string}`[] {
  const known: Record<number, `0x${string}`[]> = {
    999: [
      '0x47660230D9B8e343bdecD2e35008Bd06E47bb3e0', // v16 (two-proof)
      '0x641aDfDD98007Ea18507Aab6579C9b652c600007', // v15 (szDecimals fix)
    ],
    998: [
      '0xA9392fb511b5314d4faB0e7aAe43107b2cb32755', // testnet adapter
    ],
  };

  const base = known[chainId] ?? [];

  // Merge any additional adapters from env (comma-separated hex addresses)
  const extra = (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_HYPERLIQUID_ADAPTERS
    : process.env.NEXT_PUBLIC_HYPERLIQUID_ADAPTERS) ?? '';
  if (extra) {
    const parsed = extra
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('0x') && s.length === 42) as `0x${string}`[];
    // Prepend extras so newest adapters are checked first
    return [...parsed, ...base];
  }

  return base;
}

export interface HyperliquidPosition {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
}

export interface HyperliquidAccountState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  assetPositions: Array<{ position: HyperliquidPosition; type: string }>;
}

export interface HyperliquidMarketMeta {
  coin: string;
  markPx: string;
  midPx: string;
  funding: string;
  openInterest: string;
  dayNtlVlm: string;
  prevDayPx: string;
  premium: string;
  oraclePx: string;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Get the sub-account address for a vault by trying all known adapter versions.
 * Returns the first non-zero sub-account found.
 */
export function useSubAccount(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });
  const adapters = getAdapterAddresses(selectedChainId);

  return useQuery<`0x${string}` | null>({
    queryKey: ['hyperliquidSubAccount', vaultAddress, selectedChainId],
    queryFn: async () => {
      if (!client || !vaultAddress || adapters.length === 0) return null;

      for (const adapterAddr of adapters) {
        try {
          const result = await client.readContract({
            address: adapterAddr,
            abi: HyperliquidAdapterABI,
            functionName: 'getSubAccount',
            args: [vaultAddress],
          });
          const addr = result as `0x${string}`;
          if (addr && addr !== ZERO_ADDRESS) return addr;
        } catch {
          // This adapter doesn't have the vault registered, try next
        }
      }
      return null;
    },
    enabled: !!client && !!vaultAddress && adapters.length > 0,
    staleTime: 60_000,
  });
}

/**
 * Fetch live Hyperliquid positions for a vault's sub-account.
 */
export function useHyperliquidPosition(vaultAddress: `0x${string}` | undefined) {
  const { data: subAccountAddr } = useSubAccount(vaultAddress);

  return useQuery<HyperliquidAccountState | null>({
    queryKey: ['hyperliquidPosition', subAccountAddr],
    queryFn: async () => {
      if (!subAccountAddr) return null;

      const response = await fetch(HYPERLIQUID_INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: subAccountAddr,
        }),
      });

      if (!response.ok) return null;
      return response.json() as Promise<HyperliquidAccountState>;
    },
    enabled: !!subAccountAddr,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/**
 * Fetch live market metadata from Hyperliquid (mark price, funding, OI, volume).
 * Returns data for ALL perp assets. Filter by coin name in the component.
 */
export function useHyperliquidMarkets() {
  return useQuery<HyperliquidMarketMeta[]>({
    queryKey: ['hyperliquidMarkets'],
    queryFn: async () => {
      const [metaResponse, ctxResponse] = await Promise.all([
        fetch(HYPERLIQUID_INFO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
        }),
        Promise.resolve(null),
      ]);

      if (!metaResponse.ok) return [];

      const data = await metaResponse.json();
      // Response: [meta, assetCtxs[]] where assetCtxs has mark, funding, OI, etc.
      const meta = data[0]?.universe ?? [];
      const ctxs = data[1] ?? [];

      return meta.map((asset: any, i: number) => ({
        coin: asset.name,
        markPx: ctxs[i]?.markPx ?? '0',
        midPx: ctxs[i]?.midPx ?? '0',
        funding: ctxs[i]?.funding ?? '0',
        openInterest: ctxs[i]?.openInterest ?? '0',
        dayNtlVlm: ctxs[i]?.dayNtlVlm ?? '0',
        prevDayPx: ctxs[i]?.prevDayPx ?? '0',
        premium: ctxs[i]?.premium ?? '0',
        oraclePx: ctxs[i]?.oraclePx ?? '0',
      }));
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
