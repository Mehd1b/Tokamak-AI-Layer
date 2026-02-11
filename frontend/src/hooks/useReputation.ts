'use client';

import { useMemo } from 'react';
import { useReadContract, useReadContracts, useChainId } from 'wagmi';
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

export interface AgentRating {
  agentId: number;
  averageScore: number | null; // null = no feedback
  feedbackCount: number;
}

/**
 * Fetch ratings for a batch of agents via multicall.
 * Step 1: getClientList for each agent
 * Step 2: getSummary for agents with clients
 */
export function useAgentRatings(agentIds: number[]) {
  const chainId = useChainId();
  const enabled = agentIds.length > 0;

  // Step 1: Get client lists for all agents
  const clientListContracts = useMemo(() => {
    return agentIds.map((id) => ({
      address: CONTRACTS.reputationRegistry,
      abi: TALReputationRegistryABI,
      functionName: 'getClientList' as const,
      args: [BigInt(id)] as const,
      chainId,
    }));
  }, [agentIds, chainId]);

  const { data: clientListResults, isLoading: clientsLoading } = useReadContracts({
    contracts: enabled ? clientListContracts : [],
    query: { enabled },
  });

  // Step 2: Build summary calls for agents that have clients
  const summaryContracts = useMemo(() => {
    if (!clientListResults) return [];
    return agentIds
      .map((id, i) => {
        const result = clientListResults[i];
        if (result?.status !== 'success' || !result.result) return null;
        const clients = result.result as readonly `0x${string}`[];
        if (clients.length === 0) return null;
        return {
          address: CONTRACTS.reputationRegistry,
          abi: TALReputationRegistryABI,
          functionName: 'getSummary' as const,
          args: [BigInt(id), [...clients]] as const,
          chainId,
          _agentId: id,
        };
      })
      .filter(Boolean) as Array<{
        address: typeof CONTRACTS.reputationRegistry;
        abi: typeof TALReputationRegistryABI;
        functionName: 'getSummary';
        args: readonly [bigint, `0x${string}`[]];
        chainId: number;
        _agentId: number;
      }>;
  }, [agentIds, clientListResults, chainId]);

  const summaryEnabled = summaryContracts.length > 0;

  const { data: summaryResults, isLoading: summaryLoading } = useReadContracts({
    contracts: summaryEnabled ? summaryContracts : [],
    query: { enabled: summaryEnabled },
  });

  const ratings = useMemo<Map<number, AgentRating>>(() => {
    const map = new Map<number, AgentRating>();
    if (!clientListResults) return map;

    // Initialize all agents with no rating
    for (const id of agentIds) {
      map.set(id, { agentId: id, averageScore: null, feedbackCount: 0 });
    }

    // Fill in client counts
    for (let i = 0; i < agentIds.length; i++) {
      const result = clientListResults[i];
      if (result?.status === 'success' && result.result) {
        const clients = result.result as readonly `0x${string}`[];
        if (clients.length > 0) {
          map.set(agentIds[i], { ...map.get(agentIds[i])!, feedbackCount: clients.length });
        }
      }
    }

    // Fill in summary data
    if (summaryResults) {
      for (let i = 0; i < summaryContracts.length; i++) {
        const contract = summaryContracts[i];
        const result = summaryResults[i];
        if (result?.status === 'success' && result.result) {
          const summary = result.result as { totalValue: bigint; count: bigint; min: bigint; max: bigint };
          if (summary.count > 0n) {
            const avg = Number(summary.totalValue) / Number(summary.count) / 10;
            const existing = map.get(contract._agentId)!;
            map.set(contract._agentId, {
              ...existing,
              averageScore: avg,
              feedbackCount: Number(summary.count),
            });
          }
        }
      }
    }

    return map;
  }, [agentIds, clientListResults, summaryResults, summaryContracts]);

  return { ratings, isLoading: clientsLoading || summaryLoading };
}

export interface FeedbackEntry {
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  feedbackHash: `0x${string}`;
  isRevoked: boolean;
  timestamp: bigint;
  client: `0x${string}`;
  feedbackIndex: number;
}

export function useFeedbacks(agentId: bigint | undefined, clients: `0x${string}`[] | undefined) {
  const chainId = useChainId();
  const enabled = agentId !== undefined && !!clients && clients.length > 0;

  const contracts = useMemo(() => {
    if (!enabled) return [];
    return clients!.map((client) => ({
      address: CONTRACTS.reputationRegistry,
      abi: TALReputationRegistryABI,
      functionName: 'getFeedback' as const,
      args: [agentId!, client] as const,
      chainId,
    }));
  }, [agentId, clients, enabled, chainId]);

  const { data, isLoading } = useReadContracts({
    contracts: enabled ? contracts : [],
    query: { enabled },
  });

  const feedbacks = useMemo<FeedbackEntry[]>(() => {
    if (!data || !clients) return [];
    const all: FeedbackEntry[] = [];
    for (let i = 0; i < data.length; i++) {
      const result = data[i];
      if (result.status !== 'success' || !result.result) continue;
      const clientFeedbacks = result.result as readonly {
        value: bigint;
        valueDecimals: number;
        tag1: string;
        tag2: string;
        endpoint: string;
        feedbackURI: string;
        feedbackHash: `0x${string}`;
        isRevoked: boolean;
        timestamp: bigint;
      }[];
      for (let j = 0; j < clientFeedbacks.length; j++) {
        const fb = clientFeedbacks[j];
        if (fb.isRevoked) continue;
        all.push({
          ...fb,
          client: clients[i],
          feedbackIndex: j,
        });
      }
    }
    all.sort((a, b) => Number(b.timestamp - a.timestamp));
    return all;
  }, [data, clients]);

  return { feedbacks, isLoading };
}
