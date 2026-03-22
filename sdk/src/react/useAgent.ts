'use client';

import { useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import type { KernelAgentInfo } from '../types';

export function useAgent(agentId: `0x${string}` | undefined) {
  const client = useTokamakClient();

  return useQuery<KernelAgentInfo | null>({
    queryKey: ['tokamak', 'agent', agentId],
    queryFn: async () => {
      if (!client || !agentId) return null;
      return client.getAgent(agentId);
    },
    enabled: !!client && !!agentId,
    staleTime: 60_000,
  });
}

export function useAgentList() {
  const client = useTokamakClient();

  return useQuery<KernelAgentInfo[]>({
    queryKey: ['tokamak', 'agents'],
    queryFn: async () => {
      if (!client) return [];
      const ids = await client.agents.getAllAgentIds();
      const agents = await Promise.all(ids.map((id: `0x${string}`) => client.getAgent(id)));
      return agents.filter((a): a is KernelAgentInfo => a !== null && a.exists);
    },
    enabled: !!client,
    staleTime: 60_000,
  });
}
