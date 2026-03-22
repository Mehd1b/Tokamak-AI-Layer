'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';

export interface VaultListItem {
  address: `0x${string}`;
  agentId: `0x${string}`;
  asset: `0x${string}`;
  totalAssets: bigint;
  totalShares: bigint;
  totalValueLocked: bigint;
}

export function useVaultList() {
  const client = useTokamakClient();

  return useQuery<VaultListItem[]>({
    queryKey: ['tokamak', 'vaults'],
    queryFn: async () => {
      if (!client) return [];
      const addresses = await client.vaultFactory.getAllVaults();
      const vaults = await Promise.all(
        addresses.map(async (addr: `0x${string}`) => {
          try {
            const vc = client.createVaultClient(addr);
            const info = await vc.getInfo();
            return {
              address: addr,
              agentId: info.agentId,
              asset: info.asset,
              totalAssets: info.totalAssets,
              totalShares: info.totalShares,
              totalValueLocked: info.totalValueLocked,
            } as VaultListItem;
          } catch {
            return null;
          }
        })
      );
      return vaults.filter((v): v is VaultListItem => v !== null);
    },
    enabled: !!client,
    staleTime: 30_000,
  });
}

export function useVaultsForAgent(agentId: `0x${string}` | undefined) {
  const { data: allVaults, ...rest } = useVaultList();

  const filtered = allVaults?.filter((v) => v.agentId === agentId) ?? [];

  return { data: filtered, ...rest };
}
