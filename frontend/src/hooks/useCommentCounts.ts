'use client';

import { useQuery } from '@tanstack/react-query';

export function useCommentCounts(vaultAddresses: string[]) {
  return useQuery({
    queryKey: ['comment-counts', vaultAddresses],
    queryFn: async () => {
      if (vaultAddresses.length === 0) return {} as Record<string, number>;
      const res = await fetch(`/api/comments/counts?vaults=${vaultAddresses.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch comment counts');
      const data = await res.json();
      return data.counts as Record<string, number>;
    },
    enabled: vaultAddresses.length > 0,
    refetchInterval: 60_000,
  });
}
