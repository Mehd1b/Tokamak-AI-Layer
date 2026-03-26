'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { AgentRegistryABI } from '@/lib/contracts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Batch an array of multicall contracts into chunks to avoid RPC size limits. */
async function batchedMulticall(client: any, contracts: any[], batchSize = 20): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < contracts.length; i += batchSize) {
    const batch = contracts.slice(i, i + batchSize);
    const batchResults = await client.multicall({ contracts: batch });
    results.push(...batchResults);
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Fetches the on-chain author address for an agent and discovers all
 * other agent IDs published by the same author.
 */
export function useAgentAuthor(agentId: `0x${string}` | undefined) {
  const { contracts, selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading } = useQuery<{
    authorAddress: string | null;
    authorAgentIds: string[];
  }>({
    queryKey: ['agentAuthor', agentId, selectedChainId],
    queryFn: async () => {
      if (!client || !agentId || !contracts?.agentRegistry) {
        return { authorAddress: null, authorAgentIds: [] };
      }

      try {
        // Step 1: Get the agent info (which includes the author address)
        const info = await client.readContract({
          address: contracts.agentRegistry,
          abi: AgentRegistryABI,
          functionName: 'get',
          args: [agentId],
        }) as {
          author: string;
          imageId: string;
          agentCodeHash: string;
          _deprecated: string;
          exists: boolean;
        };

        if (!info.exists || info.author === ZERO_ADDRESS) {
          return { authorAddress: null, authorAgentIds: [] };
        }

        const authorAddress = info.author;

        // Step 2: Get all agent IDs from registry
        let allAgentIds: string[] = [];
        try {
          allAgentIds = (await client.readContract({
            address: contracts.agentRegistry,
            abi: AgentRegistryABI,
            functionName: 'getAllAgentIds',
          })) as string[];
        } catch {
          // If getAllAgentIds is not available, return just this agent's author
          return { authorAddress, authorAgentIds: [agentId] };
        }

        if (allAgentIds.length === 0) {
          return { authorAddress, authorAgentIds: [] };
        }

        // Step 3: Get info for all agents via multicall to find ones by the same author
        const getCalls = allAgentIds.map((id) => ({
          address: contracts.agentRegistry,
          abi: AgentRegistryABI,
          functionName: 'get' as const,
          args: [id] as const,
        }));

        let getResults: any[] = [];
        try {
          getResults = await batchedMulticall(client, getCalls);
        } catch {
          return { authorAddress, authorAgentIds: [agentId] };
        }

        // Step 4: Filter to agents by the same author
        const authorAgentIds: string[] = [];
        for (let i = 0; i < allAgentIds.length; i++) {
          const r = getResults[i];
          if (r?.status === 'success' && r.result) {
            // Result is a tuple: [author, imageId, agentCodeHash, _deprecated, exists]
            const resultAuthor = (r.result as any)[0] || (r.result as any).author;
            const resultExists = (r.result as any)[4] ?? (r.result as any).exists;
            if (
              resultExists &&
              resultAuthor &&
              resultAuthor.toLowerCase() === authorAddress.toLowerCase()
            ) {
              authorAgentIds.push(allAgentIds[i]);
            }
          }
        }

        return { authorAddress, authorAgentIds };
      } catch {
        return { authorAddress: null, authorAgentIds: [] };
      }
    },
    enabled: !!client && !!agentId && !!contracts?.agentRegistry,
    staleTime: 5 * 60 * 1000, // 5 min — author data rarely changes
  });

  return {
    authorAddress: data?.authorAddress ?? null,
    authorAgentIds: data?.authorAgentIds ?? [],
    isLoading,
  };
}
