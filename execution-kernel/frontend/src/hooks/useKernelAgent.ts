'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { AgentRegistryABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';

export function useAgent(agentId: `0x${string}` | undefined) {
  const { contracts, selectedChainId } = useNetwork();
  return useReadContract({
    address: contracts.agentRegistry,
    abi: AgentRegistryABI,
    functionName: 'get',
    args: agentId ? [agentId] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!agentId },
  });
}

export function useUnregisterAgent() {
  const { contracts } = useNetwork();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const unregisterAgent = (agentId: `0x${string}`, vaults: `0x${string}`[]) => {
    writeContract({
      address: contracts.agentRegistry,
      abi: AgentRegistryABI,
      functionName: 'unregister',
      args: [agentId, vaults],
    });
  };

  return { unregisterAgent, hash, isPending, isConfirming, isSuccess, error };
}

export function useRegisteredAgents() {
  const { contracts, selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  return useQuery({
    queryKey: ['registeredAgents', selectedChainId],
    queryFn: async () => {
      if (!client) return [];

      const agentIds = await client.readContract({
        address: contracts.agentRegistry,
        abi: AgentRegistryABI,
        functionName: 'getAllAgentIds',
      });

      const agents = await Promise.all(
        (agentIds as `0x${string}`[]).map(async (agentId) => {
          const data = await client.readContract({
            address: contracts.agentRegistry,
            abi: AgentRegistryABI,
            functionName: 'get',
            args: [agentId],
          });
          return {
            agentId: agentId as string,
            author: (data as any).author as string,
            imageId: (data as any).imageId as string,
            agentCodeHash: (data as any).agentCodeHash as string,
            exists: (data as any).exists as boolean,
          };
        }),
      );

      return agents;
    },
    enabled: !!client,
  });
}
