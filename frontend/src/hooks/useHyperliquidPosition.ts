'use client';

import { useReadContract } from 'wagmi';
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
] as const;

// Known HyperliquidAdapter addresses per chain
const ADAPTER_ADDRESSES: Record<number, `0x${string}`> = {
  999: '0x641aDfDD98007Ea18507Aab6579C9b652c600007', // HyperEVM mainnet (v15)
};

export interface HyperliquidPosition {
  coin: string;
  szi: string; // signed size (negative = short)
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: {
    type: string;
    value: number;
  };
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
  assetPositions: Array<{
    position: HyperliquidPosition;
    type: string;
  }>;
}

/**
 * Get the sub-account address for a vault from the HyperliquidAdapter.
 */
export function useSubAccount(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const adapterAddress = ADAPTER_ADDRESSES[selectedChainId];

  return useReadContract({
    address: adapterAddress,
    abi: HyperliquidAdapterABI,
    functionName: 'getSubAccount',
    args: vaultAddress ? [vaultAddress] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress && !!adapterAddress },
  });
}

/**
 * Fetch live Hyperliquid positions for a vault's sub-account.
 */
export function useHyperliquidPosition(vaultAddress: `0x${string}` | undefined) {
  const { data: subAccount } = useSubAccount(vaultAddress);
  const subAccountAddr = subAccount as `0x${string}` | undefined;
  const isZero = subAccountAddr === '0x0000000000000000000000000000000000000000';

  return useQuery<HyperliquidAccountState | null>({
    queryKey: ['hyperliquidPosition', subAccountAddr],
    queryFn: async () => {
      if (!subAccountAddr || isZero) return null;

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
    enabled: !!subAccountAddr && !isZero,
    refetchInterval: 10_000, // Refresh every 10 seconds
    staleTime: 5_000,
  });
}
