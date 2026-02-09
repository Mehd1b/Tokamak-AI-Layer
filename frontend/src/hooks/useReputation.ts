'use client';

import { useReadContract } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts';
import { TALReputationRegistryABI } from '../../../sdk/src/abi/TALReputationRegistry';

export function useFeedbackCount(agentId: bigint | undefined) {
  const enabled = agentId !== undefined;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.reputationRegistry,
    abi: TALReputationRegistryABI,
    functionName: 'getFeedbackCount',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  return {
    count: data as bigint | undefined,
    isLoading,
  };
}

export function useClientList(agentId: bigint | undefined) {
  const enabled = agentId !== undefined;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.reputationRegistry,
    abi: TALReputationRegistryABI,
    functionName: 'getClientList',
    args: enabled ? [agentId] : undefined,
    query: { enabled },
  });

  return {
    clients: data as `0x${string}`[] | undefined,
    isLoading,
  };
}

export function useReputationSummary(
  agentId: bigint | undefined,
  clients: `0x${string}`[] = [],
) {
  const enabled = agentId !== undefined && clients.length > 0;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.reputationRegistry,
    abi: TALReputationRegistryABI,
    functionName: 'getSummary',
    args: enabled ? [agentId, clients] : undefined,
    query: { enabled },
  });

  return {
    summary: data as { totalValue: bigint; count: bigint; min: bigint; max: bigint } | undefined,
    isLoading,
  };
}

export function useVerifiedSummary(
  agentId: bigint | undefined,
  clients: `0x${string}`[] = [],
) {
  const enabled = agentId !== undefined && clients.length > 0;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.reputationRegistry,
    abi: TALReputationRegistryABI,
    functionName: 'getVerifiedSummary',
    args: enabled ? [agentId, clients] : undefined,
    query: { enabled },
  });

  return {
    summary: data as { totalValue: bigint; count: bigint; min: bigint; max: bigint } | undefined,
    isLoading,
  };
}

export function useReviewerReputation(reviewer: `0x${string}` | undefined) {
  const enabled = !!reviewer;

  const { data, isLoading } = useReadContract({
    address: CONTRACTS.reputationRegistry,
    abi: TALReputationRegistryABI,
    functionName: 'getReviewerReputation',
    args: enabled ? [reviewer!] : undefined,
    query: { enabled },
  });

  return {
    reputation: data as bigint | undefined,
    isLoading,
  };
}
