'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { AgentRegistryABI } from '@/lib/contracts';

export interface AgentMetadata {
  name?: string;
  description?: string;
  strategy?: string;
  author?: string;
  authorUrl?: string;
  tags?: string[];
  sourceRepo?: string;
  version?: string;
}

/** Convert `ipfs://` URIs to an HTTP gateway URL. Passthrough for http(s) URLs. */
function resolveUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return uri;
}

export function useAgentMetadata(agentId: `0x${string}` | undefined) {
  const { contracts, selectedChainId } = useNetwork();
  const publicClient = usePublicClient({ chainId: selectedChainId });

  return useQuery<AgentMetadata | null>({
    queryKey: ['agentMetadata', agentId, selectedChainId],
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

        const fetchUrl = resolveUri(uri as string);
        const response = await fetch(fetchUrl);
        if (!response.ok) return null;

        return (await response.json()) as AgentMetadata;
      } catch {
        return null;
      }
    },
    enabled: !!publicClient && !!agentId && !!contracts?.agentRegistry,
    staleTime: 5 * 60 * 1000, // 5 min — metadata changes rarely
  });
}
