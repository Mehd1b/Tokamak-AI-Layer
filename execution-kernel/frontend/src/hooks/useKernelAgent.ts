'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
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

export function useComputeAgentId(author: `0x${string}` | undefined, codehash: `0x${string}` | undefined) {
  return useReadContract({
    address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
    abi: AgentRegistryABI,
    functionName: 'computeAgentId',
    args: author && codehash ? [author, codehash] : undefined,
    query: { enabled: !!author && !!codehash },
  });
}

export function useRegisterAgent() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const register = (codehash: `0x${string}`, imageId: `0x${string}`, configHash: `0x${string}`, metadataURI: string) => {
    writeContract({
      address: KERNEL_CONTRACTS.agentRegistry as `0x${string}`,
      abi: AgentRegistryABI,
      functionName: 'register',
      args: [codehash, imageId, configHash, metadataURI],
    });
  };

  return { register, hash, isPending, isConfirming, isSuccess, error };
}
