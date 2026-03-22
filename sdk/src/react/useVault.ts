'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import type { KernelVaultInfo } from '../types';
import { useAccount } from 'wagmi';

export function useVault(vaultAddress: `0x${string}` | undefined) {
  const client = useTokamakClient();
  const { address: userAddress } = useAccount();

  return useQuery<KernelVaultInfo | null>({
    queryKey: ['tokamak', 'vault', vaultAddress, userAddress],
    queryFn: async () => {
      if (!client || !vaultAddress) return null;
      const vaultClient = client.createVaultClient(vaultAddress);
      return vaultClient.getInfo(userAddress);
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 30_000,
  });
}
