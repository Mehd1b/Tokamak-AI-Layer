'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { AgentRegistryABI } from '@/lib/contracts';

export interface AgentMetadata {
  name?: string;
  description?: string;
  tags?: string[];
  sourceRepo?: string;
  version?: string;
}

export function useAgentMetadata(agentId: `0x${string}` | undefined) {
  const publicClient = usePublicClient();
  const { contracts } = useNetwork();

  return useQuery<AgentMetadata | null>({
    queryKey: ['agentMetadata', agentId],
    queryFn: async () => {
      if (!publicClient || !agentId || !contracts?.agentRegistry) return null;

      try {
        const uri = await publicClient.readContract({
          address: contracts.agentRegistry,
          abi: AgentRegistryABI,
          functionName: 'getMetadataURI',
          args: [agentId],
        });

        if (!uri || uri === '') return null;

        const response = await fetch(uri);
        if (!response.ok) return null;

        return (await response.json()) as AgentMetadata;
      } catch {
        return null;
      }
    },
    enabled: !!publicClient && !!agentId && !!contracts?.agentRegistry,
    staleTime: 300_000, // 5 min — metadata changes rarely
  });
}
