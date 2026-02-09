'use client';

import { useState, useEffect } from 'react';

interface AgentPricing {
  currency?: string;
  perRequest?: string;
}

interface AgentMetadata {
  name?: string;
  description?: string;
  capabilities?: string[];
  active?: boolean;
  services?: Record<string, string>;
  pricing?: AgentPricing;
}

interface UseAgentMetadataResult {
  name?: string;
  description?: string;
  capabilities?: string[];
  active?: boolean;
  services?: Record<string, string>;
  pricing?: AgentPricing;
  isLoading: boolean;
  error?: string;
}

const metadataCache = new Map<string, AgentMetadata>();

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

export function useAgentMetadata(agentURI: string | undefined): UseAgentMetadataResult {
  const [metadata, setMetadata] = useState<AgentMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!agentURI) {
      setMetadata(null);
      setIsLoading(false);
      return;
    }

    // Check cache first
    if (metadataCache.has(agentURI)) {
      setMetadata(metadataCache.get(agentURI)!);
      setIsLoading(false);
      return;
    }

    // Only fetch IPFS URIs
    if (!agentURI.startsWith('ipfs://')) {
      setMetadata({ description: agentURI });
      setIsLoading(false);
      return;
    }

    const fetchMetadata = async () => {
      setIsLoading(true);
      setError(undefined);

      const cid = agentURI.replace('ipfs://', '');
      let lastError: Error | null = null;

      // Try each gateway in order
      for (const gateway of IPFS_GATEWAYS) {
        try {
          const url = `${gateway}${cid}`;
          const response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();

          // Parse ERC-8004 registration file structure
          const parsed: AgentMetadata = {
            name: data.name || data.metadata?.name,
            description: data.description || data.metadata?.description,
            capabilities: data.capabilities || data.metadata?.capabilities || [],
            active: data.active !== undefined ? data.active : true,
            services: data.services || {},
            pricing: data.tal?.pricing || undefined,
          };

          metadataCache.set(agentURI, parsed);
          setMetadata(parsed);
          setIsLoading(false);
          return; // Success, exit function
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Failed to fetch metadata');
          // Continue to next gateway
        }
      }

      // All gateways failed
      const errorMessage = lastError?.message || 'Failed to fetch metadata from all gateways';
      setError(errorMessage);
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to fetch IPFS metadata:', lastError);
      }
      setIsLoading(false);
    };

    fetchMetadata();
  }, [agentURI]);

  return {
    name: metadata?.name,
    description: metadata?.description,
    capabilities: metadata?.capabilities,
    active: metadata?.active,
    services: metadata?.services,
    pricing: metadata?.pricing,
    isLoading,
    error,
  };
}
