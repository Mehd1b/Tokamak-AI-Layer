'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import type { ExecutionRecord } from '../types';

/**
 * Fetch the execution history (ExecutionApplied events) for a vault.
 * Returns records sorted newest-first.
 */
export function useExecutionHistory(
  vaultAddress: `0x${string}` | undefined,
  options?: { fromBlock?: bigint; toBlock?: bigint },
) {
  const client = useTokamakClient();

  return useQuery<ExecutionRecord[]>({
    queryKey: [
      'tokamak',
      'executionHistory',
      vaultAddress,
      options?.fromBlock?.toString(),
      options?.toBlock?.toString(),
    ],
    queryFn: async () => {
      if (!client || !vaultAddress) return [];

      const vaultClient = client.createVaultClient(vaultAddress);
      return vaultClient.getExecutionHistory(options);
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 30_000,
  });
}
