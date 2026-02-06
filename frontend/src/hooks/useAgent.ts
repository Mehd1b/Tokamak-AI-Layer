'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts';
import { TALIdentityRegistryABI } from '../../../sdk/src/abi/TALIdentityRegistry';

export function useAgent(agentId: bigint | undefined) {
  const enabled = agentId !== undefined;

  const { data: owner, isLoading: ownerLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'ownerOf',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: agentURI, isLoading: uriLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'agentURI',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: isVerified, isLoading: verifiedLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'isVerifiedOperator',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: operator } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'getOperator',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const { data: zkIdentity } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'getZKIdentity',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  const isLoading = ownerLoading || uriLoading || verifiedLoading;

  return {
    agent: enabled
      ? {
          agentId,
          owner: owner as `0x${string}` | undefined,
          agentURI: agentURI as string | undefined,
          isVerifiedOperator: isVerified as boolean | undefined,
          operator: operator as `0x${string}` | undefined,
          zkIdentity: zkIdentity as `0x${string}` | undefined,
        }
      : undefined,
    isLoading,
  };
}

export function useAgentCount() {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'getAgentCount',
  });

  return {
    count: data as bigint | undefined,
    isLoading,
  };
}

export function useAgentsByOwner(owner: `0x${string}` | undefined) {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: TALIdentityRegistryABI,
    functionName: 'getAgentsByOwner',
    args: owner ? [owner] : undefined,
    query: { enabled: !!owner },
  });

  return {
    agentIds: data as bigint[] | undefined,
    isLoading,
  };
}
