'use client';

import { useState, useEffect } from 'react';

interface AgentPricing {
  currency?: string;
  perRequest?: string;
}

export interface CapabilityMeta {
  name: string;
  description: string;
  placeholder?: string;
}

export interface CustomUIMeta {
  html: string;
  cdnLinks?: string[];
  embedApiVersion: string;
  minHeight?: number;
}

export interface AgentSocials {
  x?: string;
  website?: string;
}

interface AgentMetadata {
  name?: string;
  description?: string;
  image?: string;
  capabilities?: string[];
  talCapabilities?: CapabilityMeta[];
  requestExample?: string;
  active?: boolean;
  services?: Record<string, string>;
  socials?: AgentSocials;
  pricing?: AgentPricing;
  customUI?: CustomUIMeta;
}

interface UseAgentMetadataResult {
  name?: string;
  description?: string;
  image?: string;
  capabilities?: string[];
  talCapabilities?: CapabilityMeta[];
  requestExample?: string;
  active?: boolean;
  services?: Record<string, string>;
  socials?: AgentSocials;
  pricing?: AgentPricing;
  customUI?: CustomUIMeta;
  isLoading: boolean;
  error?: string;
}

const metadataCache = new Map<string, AgentMetadata>();

export function getCachedMetadata(agentURI: string): AgentMetadata | undefined {
  return metadataCache.get(agentURI);
}

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
    // Reset state immediately so stale data from a previous URI is never shown
    setMetadata(null);
    setError(undefined);

    if (!agentURI) {
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

    let cancelled = false;

    const fetchMetadata = async () => {
      setIsLoading(true);

      const cid = agentURI.replace('ipfs://', '');
      let lastError: Error | null = null;

      // Try each gateway in order
      for (const gateway of IPFS_GATEWAYS) {
        if (cancelled) return;
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

          if (cancelled) return;

          // Parse ERC-8004 registration file structure
          const talCaps = data.tal?.capabilities;
          const rawCustomUI = data.tal?.customUI;
          // Parse socials
          const rawSocials = data.socials;
          const socials: AgentSocials | undefined =
            rawSocials && typeof rawSocials === 'object'
              ? {
                  ...(typeof rawSocials.x === 'string' && rawSocials.x ? { x: rawSocials.x } : {}),
                  ...(typeof rawSocials.website === 'string' && rawSocials.website ? { website: rawSocials.website } : {}),
                }
              : undefined;

          const parsed: AgentMetadata = {
            name: data.name || data.metadata?.name,
            description: data.description || data.metadata?.description,
            image: data.image || data.metadata?.image || undefined,
            capabilities: data.capabilities || data.metadata?.capabilities || [],
            talCapabilities: Array.isArray(talCaps)
              ? talCaps.filter((c: CapabilityMeta) => c && typeof c.name === 'string')
              : undefined,
            requestExample: data.tal?.requestExample || undefined,
            active: data.active !== undefined ? data.active : true,
            services: data.services || {},
            socials: socials && Object.keys(socials).length > 0 ? socials : undefined,
            pricing: data.tal?.pricing || undefined,
            customUI: rawCustomUI && typeof rawCustomUI.html === 'string'
              ? {
                  html: rawCustomUI.html,
                  cdnLinks: Array.isArray(rawCustomUI.cdnLinks) ? rawCustomUI.cdnLinks : undefined,
                  embedApiVersion: rawCustomUI.embedApiVersion || '1',
                  minHeight: typeof rawCustomUI.minHeight === 'number' ? rawCustomUI.minHeight : undefined,
                }
              : undefined,
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

      if (cancelled) return;

      // All gateways failed
      const errorMessage = lastError?.message || 'Failed to fetch metadata from all gateways';
      setError(errorMessage);
      setMetadata(null);
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to fetch IPFS metadata:', lastError);
      }
      setIsLoading(false);
    };

    fetchMetadata();

    return () => { cancelled = true; };
  }, [agentURI]);

  return {
    name: metadata?.name,
    description: metadata?.description,
    image: metadata?.image,
    capabilities: metadata?.capabilities,
    talCapabilities: metadata?.talCapabilities,
    requestExample: metadata?.requestExample,
    active: metadata?.active,
    services: metadata?.services,
    socials: metadata?.socials,
    pricing: metadata?.pricing,
    customUI: metadata?.customUI,
    isLoading,
    error,
  };
}
