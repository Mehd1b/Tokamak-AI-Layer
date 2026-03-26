'use client';

import { useMemo } from 'react';
import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useDeployedVaultsList, type VaultInfo } from '@/hooks/useVaultFactory';
import { useNetwork } from '@/lib/NetworkContext';
import { AgentRegistryABI } from '@/lib/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentLeaderboardEntry {
  agentId: string;
  name: string;
  strategy: string;
  totalTVL: bigint;
  vaultCount: number;
  return7d: number | null;
  return30d: number | null;
  returnAllTime: number | null;
  maxDrawdown: number | null;
  executionCount: number;
  vaults: VaultInfo[];
}

export type TimePeriod = '7d' | '30d' | 'all';

/* ------------------------------------------------------------------ */
/*  Performance ABI (matches useVaultPerformance)                      */
/* ------------------------------------------------------------------ */

const PerformanceABI = [
  {
    type: 'function',
    name: 'getPerformanceMetrics',
    inputs: [],
    outputs: [
      { type: 'uint256', name: '_initialPps' },
      { type: 'uint256', name: '_initialPpsTimestamp' },
      { type: 'uint256', name: '_currentPps' },
      { type: 'uint256', name: '_peakPps' },
      { type: 'uint256', name: '_maxDrawdownBps' },
      { type: 'uint256', name: '_executionWins' },
      { type: 'uint256', name: '_totalExecutionCount' },
      { type: 'uint256', name: '_checkpointIndex' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPpsCheckpoints',
    inputs: [],
    outputs: [
      { type: 'uint256[30]', name: 'values' },
      { type: 'uint256[30]', name: 'timestamps' },
      { type: 'uint256', name: 'index' },
    ],
    stateMutability: 'view',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Convert `ipfs://` URIs to an HTTP gateway URL. */
function resolveUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return uri;
}

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

interface VaultPerf {
  initialPps: bigint;
  currentPps: bigint;
  maxDrawdownBps: bigint;
  executionCount: number;
  return7d: number | null;
  return30d: number | null;
  returnAllTime: number | null;
  tvl: bigint;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useAgentLeaderboard() {
  const { contracts, selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });
  const { data: allVaults, isLoading: isLoadingVaults } = useDeployedVaultsList();

  // Group vaults by agentId
  const vaultsByAgent = useMemo(() => {
    if (!allVaults) return new Map<string, VaultInfo[]>();
    const map = new Map<string, VaultInfo[]>();
    for (const v of allVaults) {
      const key = v.agentId.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.push(v);
      } else {
        map.set(key, [v]);
      }
    }
    return map;
  }, [allVaults]);

  const agentIds = useMemo(() => [...vaultsByAgent.keys()], [vaultsByAgent]);
  const vaultAddresses = useMemo(
    () => (allVaults ?? []).map((v) => v.address),
    [allVaults],
  );

  // Fetch all metadata and performance in a single query
  const { data: leaderboard, isLoading: isLoadingLeaderboard } = useQuery<AgentLeaderboardEntry[]>({
    queryKey: ['agentLeaderboard', selectedChainId, agentIds.join(','), vaultAddresses.join(',')],
    queryFn: async () => {
      if (!client || agentIds.length === 0 || !contracts?.agentRegistry) return [];

      // Step 1: Fetch agent metadata URIs via multicall
      const uriCalls = agentIds.map((id) => ({
        address: contracts.agentRegistry,
        abi: AgentRegistryABI,
        functionName: 'getMetadataURI' as const,
        args: [id] as const,
      }));

      let uriResults: any[] = [];
      try {
        uriResults = await batchedMulticall(client, uriCalls);
      } catch {
        // Continue with empty metadata
      }

      // Step 2: Fetch JSON metadata for each agent
      const metadataMap: Record<string, { name?: string; strategy?: string }> = {};
      const fetchPromises = agentIds.map(async (id, i) => {
        const r = uriResults[i];
        if (r?.status !== 'success' || !r.result || r.result === '') return;
        try {
          const url = resolveUri(r.result as string);
          const resp = await fetch(url);
          if (!resp.ok) return;
          const json = await resp.json();
          metadataMap[id] = { name: json.name, strategy: json.strategy };
        } catch {
          // Skip failed fetches
        }
      });
      await Promise.allSettled(fetchPromises);

      // Step 3: Fetch performance metrics for all vaults
      const metricsCalls = vaultAddresses.map((addr) => ({
        address: addr,
        abi: PerformanceABI,
        functionName: 'getPerformanceMetrics' as const,
      }));

      let metricsResults: any[] = [];
      try {
        metricsResults = await batchedMulticall(client, metricsCalls);
      } catch {
        // Fallback: no performance data
      }

      // Step 4: Fetch PPS checkpoints for all vaults
      const checkpointCalls = vaultAddresses.map((addr) => ({
        address: addr,
        abi: PerformanceABI,
        functionName: 'getPpsCheckpoints' as const,
      }));

      let checkpointResults: any[] = [];
      try {
        checkpointResults = await batchedMulticall(client, checkpointCalls);
      } catch {
        // Proceed without checkpoints
      }

      // Step 5: Compute per-vault performance
      const vaultPerfMap: Record<string, VaultPerf> = {};
      const now = Math.floor(Date.now() / 1000);
      const sevenDaysAgo = now - 7 * 86400;
      const thirtyDaysAgo = now - 30 * 86400;

      for (let i = 0; i < vaultAddresses.length; i++) {
        const addr = vaultAddresses[i].toLowerCase();
        const vault = allVaults![i];
        const m = metricsResults[i];

        if (m?.status !== 'success' || !m.result) {
          vaultPerfMap[addr] = {
            initialPps: 0n,
            currentPps: 0n,
            maxDrawdownBps: 0n,
            executionCount: 0,
            return7d: null,
            return30d: null,
            returnAllTime: null,
            tvl: vault.totalValueLocked,
          };
          continue;
        }

        const [
          initialPps, , currentPps, , maxDrawdownBps, , totalExecutionCount,
        ] = m.result as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

        const execCount = Number(totalExecutionCount);

        // All-time return
        const returnAllTime = initialPps > 0n
          ? (Number(currentPps - initialPps) / Number(initialPps)) * 100
          : null;

        // Time-windowed returns from checkpoints
        let return7d: number | null = null;
        let return30d: number | null = null;

        const cp = checkpointResults[i];
        if (cp?.status === 'success' && cp.result) {
          const [values, timestamps, idx] = cp.result as unknown as [bigint[], bigint[], bigint];
          const count = Number(idx) < 30 ? Number(idx) : 30;

          let closest7d: bigint | null = null;
          let closest7dDist = Infinity;
          let closest30d: bigint | null = null;
          let closest30dDist = Infinity;

          for (let j = 0; j < count; j++) {
            const bufIdx = Number(idx) <= 30 ? j : (Number(idx) - 30 + j) % 30;
            const ts = Number(timestamps[bufIdx]);
            const pps = values[bufIdx];
            if (ts === 0 || pps === 0n) continue;

            if (ts <= sevenDaysAgo) {
              const dist = sevenDaysAgo - ts;
              if (dist < closest7dDist) {
                closest7dDist = dist;
                closest7d = pps;
              }
            }

            if (ts <= thirtyDaysAgo) {
              const dist = thirtyDaysAgo - ts;
              if (dist < closest30dDist) {
                closest30dDist = dist;
                closest30d = pps;
              }
            }
          }

          if (closest7d !== null && closest7d > 0n) {
            return7d = (Number(currentPps - closest7d) / Number(closest7d)) * 100;
          }
          if (closest30d !== null && closest30d > 0n) {
            return30d = (Number(currentPps - closest30d) / Number(closest30d)) * 100;
          }
        }

        // Fallback: use all-time return if no windowed data
        if (return30d === null && returnAllTime !== null) return30d = returnAllTime;
        if (return7d === null && returnAllTime !== null) return7d = returnAllTime;

        vaultPerfMap[addr] = {
          initialPps,
          currentPps,
          maxDrawdownBps,
          executionCount: execCount,
          return7d,
          return30d,
          returnAllTime,
          tvl: vault.totalValueLocked,
        };
      }

      // Step 6: Aggregate per agent
      const entries: AgentLeaderboardEntry[] = agentIds.map((agentId) => {
        const vaults = vaultsByAgent.get(agentId) ?? [];
        const meta = metadataMap[agentId];

        let totalTVL = 0n;
        let totalExecCount = 0;
        let worstDrawdownBps = 0n;

        // For weighted average returns
        let weightedReturn7d = 0;
        let weightedReturn30d = 0;
        let weightedReturnAllTime = 0;
        let totalWeight7d = 0;
        let totalWeight30d = 0;
        let totalWeightAllTime = 0;

        for (const vault of vaults) {
          const perf = vaultPerfMap[vault.address.toLowerCase()];
          if (!perf) continue;

          const tvlWeight = Number(perf.tvl);
          totalTVL += perf.tvl;
          totalExecCount += perf.executionCount;

          if (perf.maxDrawdownBps > worstDrawdownBps) {
            worstDrawdownBps = perf.maxDrawdownBps;
          }

          if (perf.return7d !== null && tvlWeight > 0) {
            weightedReturn7d += perf.return7d * tvlWeight;
            totalWeight7d += tvlWeight;
          }

          if (perf.return30d !== null && tvlWeight > 0) {
            weightedReturn30d += perf.return30d * tvlWeight;
            totalWeight30d += tvlWeight;
          }

          if (perf.returnAllTime !== null && tvlWeight > 0) {
            weightedReturnAllTime += perf.returnAllTime * tvlWeight;
            totalWeightAllTime += tvlWeight;
          }
        }

        const maxDrawdown = worstDrawdownBps > 0n
          ? -(Number(worstDrawdownBps) / 100)
          : totalExecCount > 0 ? 0 : null;

        return {
          agentId,
          name: meta?.name ?? '',
          strategy: meta?.strategy ?? '',
          totalTVL,
          vaultCount: vaults.length,
          return7d: totalWeight7d > 0 ? weightedReturn7d / totalWeight7d : null,
          return30d: totalWeight30d > 0 ? weightedReturn30d / totalWeight30d : null,
          returnAllTime: totalWeightAllTime > 0 ? weightedReturnAllTime / totalWeightAllTime : null,
          maxDrawdown,
          executionCount: totalExecCount,
          vaults,
        };
      });

      // Sort by TVL descending by default
      entries.sort((a, b) => (a.totalTVL > b.totalTVL ? -1 : a.totalTVL < b.totalTVL ? 1 : 0));

      return entries;
    },
    enabled: !!client && agentIds.length > 0 && !!contracts?.agentRegistry,
    staleTime: 30_000,
  });

  return {
    data: leaderboard ?? [],
    isLoading: isLoadingVaults || isLoadingLeaderboard,
  };
}
