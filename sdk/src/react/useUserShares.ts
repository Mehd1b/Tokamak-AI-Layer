'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import { useAccount } from 'wagmi';

export interface UserSharesInfo {
  shares: bigint;
  assetsValue: bigint;
}

export function useUserShares(vaultAddress: `0x${string}` | undefined) {
  const client = useTokamakClient();
  const { address } = useAccount();

  return useQuery<UserSharesInfo | null>({
    queryKey: ['tokamak', 'userShares', vaultAddress, address],
    queryFn: async () => {
      if (!client || !vaultAddress || !address) return null;
      const vc = client.createVaultClient(vaultAddress);
      const shares = await vc.shares(address);
      const assetsValue = shares > 0n ? await vc.convertToAssets(shares) : 0n;
      return { shares, assetsValue };
    },
    enabled: !!client && !!vaultAddress && !!address,
    staleTime: 15_000,
  });
}
