'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import type { PpsHistoryData } from '../types';

/**
 * Fetch the PPS (price-per-share) checkpoint history for a vault.
 * Returns parallel arrays of timestamps and values, sorted oldest-first.
 */
export function useVaultPPSHistory(vaultAddress: `0x${string}` | undefined) {
  const client = useTokamakClient();

  return useQuery<PpsHistoryData | null>({
    queryKey: ['tokamak', 'ppsHistory', vaultAddress],
    queryFn: async () => {
      if (!client || !vaultAddress) return null;

      const vaultClient = client.createVaultClient(vaultAddress);
      const history = await vaultClient.getPpsHistory();

      return {
        timestamps: history.map((cp) => cp.timestamp),
        values: history.map((cp) => cp.value),
      };
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 30_000,
  });
}
