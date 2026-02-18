'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { sepolia } from 'wagmi/chains';
import { KERNEL_CONTRACTS, AgentRegistryABI } from '@/lib/contracts';

export function useAgentExists(agentId: `0x${string}` | undefined) {
  return useReadContract({
    address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
    abi: AgentRegistryABI,
    functionName: 'agentExists',
    args: agentId ? [agentId] : undefined,
    query: { enabled: !!agentId },
  });
}

export function useAgent(agentId: `0x${string}` | undefined) {
  return useReadContract({
    address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
    abi: AgentRegistryABI,
    functionName: 'get',
    args: agentId ? [agentId] : undefined,
    query: { enabled: !!agentId },
  });
}

export function useComputeAgentId(author: `0x${string}` | undefined, salt: `0x${string}` | undefined) {
  return useReadContract({
    address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
    abi: AgentRegistryABI,
    functionName: 'computeAgentId',
    args: author && salt ? [author, salt] : undefined,
    query: { enabled: !!author && !!salt },
  });
}

export function useRegisterAgent() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const register = (salt: `0x${string}`, imageId: `0x${string}`, agentCodeHash: `0x${string}`) => {
    writeContract({
      address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
      abi: AgentRegistryABI,
      functionName: 'register',
      args: [salt, imageId, agentCodeHash],
    });
  };

  return { register, hash, isPending, isConfirming, isSuccess, error };
}

export function useUnregisterAgent() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const unregisterAgent = (agentId: `0x${string}`, vaults: `0x${string}`[]) => {
    writeContract({
      address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
      abi: AgentRegistryABI,
      functionName: 'unregister',
      args: [agentId, vaults],
    });
  };

  return { unregisterAgent, hash, isPending, isConfirming, isSuccess, error };
}

export function useRegisteredAgents() {
  const client = usePublicClient({ chainId: sepolia.id });

  return useQuery({
    queryKey: ['registeredAgents'],
    queryFn: async () => {
      if (!client) return [];

      // Fetch all agent IDs using the enumeration getter
      const agentIds = await client.readContract({
        address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
        abi: AgentRegistryABI,
        functionName: 'getAllAgentIds',
      });

      // Fetch full details for each agent
      const agents = await Promise.all(
        (agentIds as `0x${string}`[]).map(async (agentId) => {
          const data = await client.readContract({
            address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
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
