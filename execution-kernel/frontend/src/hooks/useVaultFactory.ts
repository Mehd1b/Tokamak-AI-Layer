'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { VaultFactoryABI, KernelVaultABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const ERC20_METADATA_ABI = [
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const;

export interface VaultInfo {
  address: `0x${string}`;
  agentId: string;
  asset: string;
  totalAssets: bigint;
  totalShares: bigint;
  totalValueLocked: bigint;
  assetDecimals: number;
  assetSymbol: string;
}

export function useIsDeployedVault(vaultAddress: `0x${string}` | undefined) {
  const { contracts, selectedChainId } = useNetwork();
  return useReadContract({
    address: contracts.vaultFactory,
    abi: VaultFactoryABI,
    functionName: 'isDeployedVault',
    args: vaultAddress ? [vaultAddress] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });
}

export function useComputeVaultAddress(
  owner: `0x${string}` | undefined,
  agentId: `0x${string}` | undefined,
  asset: `0x${string}` | undefined,
  userSalt: `0x${string}` | undefined,
) {
  const { contracts, selectedChainId } = useNetwork();
  return useReadContract({
    address: contracts.vaultFactory,
    abi: VaultFactoryABI,
    functionName: 'computeVaultAddress',
    args: owner && agentId && asset && userSalt ? [owner, agentId, asset, userSalt] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!owner && !!agentId && !!asset && !!userSalt },
  });
}

export function useDeployVault() {
  const { contracts, selectedChainId } = useNetwork();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: selectedChainId });

  const deploy = (agentId: `0x${string}`, asset: `0x${string}`, userSalt: `0x${string}`) => {
    writeContract({
      address: contracts.vaultFactory,
      abi: VaultFactoryABI,
      functionName: 'deployVault',
      args: [agentId, asset, userSalt],
      chainId: selectedChainId,
    });
  };

  return { deploy, hash, isPending, isConfirming, isSuccess, error };
}

export function useDeployedVaultsList() {
  const { contracts, selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  return useQuery<VaultInfo[]>({
    queryKey: ['deployedVaults', selectedChainId],
    queryFn: async () => {
      if (!client) return [];

      const vaultAddresses = await client.readContract({
        address: contracts.vaultFactory,
        abi: VaultFactoryABI,
        functionName: 'getAllVaults',
      }) as `0x${string}`[];

      if (vaultAddresses.length === 0) return [];

      // Try multicall first, fall back to individual reads (some chains lack multicall3)
      try {
        const calls = vaultAddresses.flatMap((vaultAddress) => [
          { address: vaultAddress, abi: KernelVaultABI, functionName: 'agentId' as const },
          { address: vaultAddress, abi: KernelVaultABI, functionName: 'asset' as const },
          { address: vaultAddress, abi: KernelVaultABI, functionName: 'totalAssets' as const },
          { address: vaultAddress, abi: KernelVaultABI, functionName: 'totalShares' as const },
        ]);

        const results = await client.multicall({ contracts: calls });

        const tvlCalls = vaultAddresses.map((vaultAddress) => ({
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'totalValueLocked' as const,
        }));

        const tvlResults = await client.multicall({ contracts: tvlCalls });

        // Fetch ERC-20 metadata (decimals, symbol) for each vault's asset
        const metaCalls = vaultAddresses.flatMap((_, i) => {
          const base = i * 4;
          const assetAddr = (results[base + 1]?.result as `0x${string}`) ?? (ZERO_ADDRESS as `0x${string}`);
          return [
            { address: assetAddr, abi: ERC20_METADATA_ABI, functionName: 'decimals' as const },
            { address: assetAddr, abi: ERC20_METADATA_ABI, functionName: 'symbol' as const },
          ];
        });
        let metaResults: any[] = [];
        try { metaResults = await client.multicall({ contracts: metaCalls }); } catch {}

        return vaultAddresses.map((vaultAddress, i) => {
          const base = i * 4;
          const agentId = results[base]?.result as string ?? '0x';
          const asset = results[base + 1]?.result as string ?? '0x';
          const totalAssets = (results[base + 2]?.result as bigint) ?? BigInt(0);
          const totalShares = (results[base + 3]?.result as bigint) ?? BigInt(0);
          const totalValueLocked = tvlResults[i]?.status === 'success'
            ? (tvlResults[i].result as bigint)
            : totalAssets;

          const isEth = asset === ZERO_ADDRESS;
          const assetDecimals = isEth ? 18 : (metaResults[i * 2]?.status === 'success' ? Number(metaResults[i * 2].result) : 18);
          const assetSymbol = isEth ? 'ETH' : (metaResults[i * 2 + 1]?.status === 'success' ? String(metaResults[i * 2 + 1].result) : 'TOKEN');

          return { address: vaultAddress, agentId, asset, totalAssets, totalShares, totalValueLocked, assetDecimals, assetSymbol };
        });
      } catch {
        // Fallback: individual reads (for chains without multicall3)
        const vaults = await Promise.all(
          vaultAddresses.map(async (vaultAddress) => {
            const [agentId, asset, totalAssets, totalShares] = await Promise.all([
              client.readContract({ address: vaultAddress, abi: KernelVaultABI, functionName: 'agentId' }).catch(() => '0x'),
              client.readContract({ address: vaultAddress, abi: KernelVaultABI, functionName: 'asset' }).catch(() => '0x'),
              client.readContract({ address: vaultAddress, abi: KernelVaultABI, functionName: 'totalAssets' }).catch(() => BigInt(0)),
              client.readContract({ address: vaultAddress, abi: KernelVaultABI, functionName: 'totalShares' }).catch(() => BigInt(0)),
            ]);

            let totalValueLocked: bigint;
            try {
              totalValueLocked = await client.readContract({ address: vaultAddress, abi: KernelVaultABI, functionName: 'totalValueLocked' }) as bigint;
            } catch {
              totalValueLocked = totalAssets as bigint;
            }

            const isEth = (asset as string) === ZERO_ADDRESS;
            let assetDecimals = 18;
            let assetSymbol = isEth ? 'ETH' : 'TOKEN';
            if (!isEth) {
              try {
                const [dec, sym] = await Promise.all([
                  client.readContract({ address: asset as `0x${string}`, abi: ERC20_METADATA_ABI, functionName: 'decimals' }),
                  client.readContract({ address: asset as `0x${string}`, abi: ERC20_METADATA_ABI, functionName: 'symbol' }),
                ]);
                assetDecimals = Number(dec);
                assetSymbol = String(sym);
              } catch {}
            }

            return {
              address: vaultAddress,
              agentId: agentId as string,
              asset: asset as string,
              totalAssets: totalAssets as bigint,
              totalShares: totalShares as bigint,
              totalValueLocked,
              assetDecimals,
              assetSymbol,
            };
          }),
        );
        return vaults;
      }
    },
    enabled: !!client,
    staleTime: 30_000,
  });
}

export function useVaultsForAgent(agentId: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const { data: allVaults, isLoading, error } = useDeployedVaultsList();

  return useQuery<VaultInfo[]>({
    queryKey: ['vaultsForAgent', agentId, selectedChainId],
    queryFn: () => {
      if (!allVaults || !agentId) return [];
      return allVaults.filter((v) => v.agentId === agentId);
    },
    enabled: !!allVaults && !!agentId && !isLoading,
    staleTime: 0,
  });
}
