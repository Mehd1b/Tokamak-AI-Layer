'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import { useAccount } from 'wagmi';
import type { UserPortfolio, UserVaultPosition } from '../types';

/**
 * Fetch the connected user's portfolio across all vaults.
 *
 * Enumerates every vault from VaultFactory, checks the user's share balance
 * in each, and computes total value and PnL.
 *
 * @param userAddressOverride - Override the wagmi-connected address (useful for viewing other users)
 */
export function useUserPortfolio(userAddressOverride?: `0x${string}`) {
  const client = useTokamakClient();
  const { address: connectedAddress } = useAccount();
  const userAddress = userAddressOverride ?? connectedAddress;

  return useQuery<UserPortfolio | null>({
    queryKey: ['tokamak', 'userPortfolio', userAddress],
    queryFn: async () => {
      if (!client || !userAddress) return null;

      // Fetch all vault addresses from the factory
      const allVaultAddresses = await client.vaultFactory.getAllVaults();

      // Check shares in each vault in parallel
      const positions = await Promise.all(
        allVaultAddresses.map(async (vaultAddr): Promise<UserVaultPosition | null> => {
          try {
            const vc = client.createVaultClient(vaultAddr);
            const shares = await vc.shares(userAddress);
            if (shares === 0n) return null;

            // User has shares — fetch details
            const [assetsValue, agentIdVal, assetAddr, totalDepositedVal] =
              await Promise.all([
                vc.convertToAssets(shares),
                vc.agentId(),
                vc.asset(),
                vc.totalDeposited(),
              ]);

            // Compute per-vault PnL:
            // We approximate user PnL using the vault-level metrics.
            // PnL = current assets value - proportional share of totalDeposited
            // This is an approximation; accurate per-user tracking would require
            // indexing individual deposit/withdraw events.
            const totalShares = await vc.totalShares();
            const userDepositEstimate =
              totalShares > 0n
                ? (totalDepositedVal * shares) / totalShares
                : 0n;
            const pnl = assetsValue - userDepositEstimate;

            return {
              vaultAddress: vaultAddr,
              agentId: agentIdVal,
              asset: assetAddr,
              shares,
              assetsValue,
              pnl,
              totalDeposited: userDepositEstimate,
            };
          } catch {
            return null;
          }
        }),
      );

      // Filter out vaults where user has no position
      const vaults = positions.filter(
        (p): p is UserVaultPosition => p !== null,
      );

      // Aggregate totals
      const totalValue = vaults.reduce((sum, v) => sum + v.assetsValue, 0n);
      const totalPnL = vaults.reduce((sum, v) => sum + v.pnl, 0n);

      return { vaults, totalValue, totalPnL };
    },
    enabled: !!client && !!userAddress,
    staleTime: 15_000,
  });
}
