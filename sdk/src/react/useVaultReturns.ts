'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import type { VaultReturns } from '../types';

const SEVEN_DAYS_SECS = 7 * 24 * 60 * 60;
const THIRTY_DAYS_SECS = 30 * 24 * 60 * 60;

/**
 * Fetch vault return metrics: 7d, 30d, all-time returns, and max drawdown.
 *
 * Uses the TokamakProvider context client by default.
 * Pass `publicClient` + `vaultAddress` to override.
 */
export function useVaultReturns(vaultAddress: `0x${string}` | undefined) {
  const client = useTokamakClient();

  return useQuery<VaultReturns | null>({
    queryKey: ['tokamak', 'vaultReturns', vaultAddress],
    queryFn: async () => {
      if (!client || !vaultAddress) return null;

      const vaultClient = client.createVaultClient(vaultAddress);
      const metrics = await vaultClient.getPerformanceMetrics();

      const now = Math.floor(Date.now() / 1000);

      // Compute period returns from PPS history checkpoints
      let return7d: number | null = null;
      let return30d: number | null = null;

      if (metrics.ppsHistory.length > 0) {
        const cutoff7d = now - SEVEN_DAYS_SECS;
        const cutoff30d = now - THIRTY_DAYS_SECS;

        // Find the checkpoint closest to (but before or at) the cutoff
        const findClosestBefore = (cutoff: number) => {
          let best: { timestamp: number; value: bigint } | null = null;
          for (const cp of metrics.ppsHistory) {
            if (cp.timestamp <= cutoff) {
              if (!best || cp.timestamp > best.timestamp) {
                best = cp;
              }
            }
          }
          return best;
        };

        const cp7d = findClosestBefore(cutoff7d);
        const cp30d = findClosestBefore(cutoff30d);

        if (cp7d && cp7d.value > 0n) {
          return7d =
            Number(((metrics.currentPps - cp7d.value) * 10000n) / cp7d.value) / 100;
        }
        if (cp30d && cp30d.value > 0n) {
          return30d =
            Number(((metrics.currentPps - cp30d.value) * 10000n) / cp30d.value) / 100;
        }
      }

      return {
        return7d,
        return30d,
        allTime: metrics.allTimeReturnPct,
        maxDrawdown: metrics.maxDrawdownBps / 100, // convert bps to percentage
      };
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 30_000,
  });
}
