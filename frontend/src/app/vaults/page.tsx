'use client';

import { useState, useMemo } from 'react';
import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useIsDeployedVault, useDeployedVaultsList } from '@/hooks/useVaultFactory';
import { useCommentCounts } from '@/hooks/useCommentCounts';
import { useBatchFees } from '@/hooks/useBatchFees';
import { useNetwork } from '@/lib/NetworkContext';
import { VaultCard, VaultRow } from '@/components/VaultCard';
import { VaultExplainer } from '@/components/VaultExplainer';
import { PROTOCOL_TYPE } from '@/lib/protocolTypes';
import { AgentRegistryABI } from '@/lib/contracts';
import { useStoredReferralCode } from '@/hooks/useReferral';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SortKey = 'tvl' | 'balance' | 'newest' | 'oldest' | 'shares' | 'comments' | 'returns' | 'drawdown';
type ViewMode = 'grid' | 'list';
type ProtocolFilter = 'all' | 'generic' | 'hyperliquid' | 'polymarket';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'tvl', label: 'TVL' },
  { key: 'returns', label: 'Returns 30d' },
  { key: 'drawdown', label: 'Low Drawdown' },
  { key: 'balance', label: 'Balance' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'shares', label: 'Shares' },
  { key: 'comments', label: 'Comments' },
];

const PROTOCOL_FILTERS: { key: ProtocolFilter; label: string; protocolType?: number }[] = [
  { key: 'all', label: 'All' },
  { key: 'generic', label: 'Yield', protocolType: PROTOCOL_TYPE.GENERIC },
  { key: 'hyperliquid', label: 'Perp Trading', protocolType: PROTOCOL_TYPE.HYPERLIQUID },
  { key: 'polymarket', label: 'Prediction', protocolType: PROTOCOL_TYPE.POLYMARKET },
];

/* Color mapping for protocol filter chips */
function filterChipColors(key: ProtocolFilter, active: boolean): string {
  if (!active) return 'text-gray-500 hover:text-gray-300';
  switch (key) {
    case 'hyperliquid':
      return 'bg-emerald-500/15 text-emerald-400 shadow-sm';
    case 'polymarket':
      return 'bg-blue-500/15 text-blue-400 shadow-sm';
    case 'generic':
      return 'bg-gray-500/15 text-gray-300 shadow-sm';
    default:
      return 'bg-[#c4f547]/15 text-[#d5f972] shadow-sm';
  }
}

/* ------------------------------------------------------------------ */
/*  Performance ABI (same as useVaultPerformance)                      */
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
/*  Batch performance hook — page-level multicall for sorting          */
/* ------------------------------------------------------------------ */

interface BatchPerf {
  returnSince30d: number | null;
  maxDrawdown: number | null;
}

function useBatchPerformance(vaultAddresses: `0x${string}`[]) {
  const { selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  return useQuery<Record<string, BatchPerf>>({
    queryKey: ['batchPerformance', selectedChainId, vaultAddresses.join(',')],
    queryFn: async () => {
      if (!client || vaultAddresses.length === 0) return {};

      // Step 1: Fetch metrics for all vaults via multicall
      const metricsCalls = vaultAddresses.map((addr) => ({
        address: addr,
        abi: PerformanceABI,
        functionName: 'getPerformanceMetrics' as const,
      }));

      let metricsResults: any[] = [];
      try {
        metricsResults = await client.multicall({ contracts: metricsCalls });
      } catch {
        // If multicall fails, return empty — VaultCards still show individual data
        return {};
      }

      // Step 2: Fetch checkpoints for vaults that have metrics
      const checkpointCalls = vaultAddresses.map((addr) => ({
        address: addr,
        abi: PerformanceABI,
        functionName: 'getPpsCheckpoints' as const,
      }));

      let checkpointResults: any[] = [];
      try {
        checkpointResults = await client.multicall({ contracts: checkpointCalls });
      } catch {
        // Proceed with metrics-only data
      }

      const result: Record<string, BatchPerf> = {};
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 86400;

      for (let i = 0; i < vaultAddresses.length; i++) {
        const addr = vaultAddresses[i].toLowerCase();
        const m = metricsResults[i];

        if (m?.status !== 'success' || !m.result) {
          result[addr] = { returnSince30d: null, maxDrawdown: null };
          continue;
        }

        const [
          initialPps, , currentPps, , maxDrawdownBps, , totalExecutionCount,
        ] = m.result as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

        const execCount = Number(totalExecutionCount);
        const maxDrawdown = maxDrawdownBps > 0n
          ? -(Number(maxDrawdownBps) / 100)
          : execCount > 0 ? 0 : null;

        // Compute 30d return from checkpoints
        let returnSince30d: number | null = null;

        const cp = checkpointResults[i];
        if (cp?.status === 'success' && cp.result) {
          const [values, timestamps, idx] = cp.result as unknown as [bigint[], bigint[], bigint];
          const count = Number(idx) < 30 ? Number(idx) : 30;

          let closest30d: bigint | null = null;
          let closest30dDist = Infinity;

          for (let j = 0; j < count; j++) {
            const bufIdx = Number(idx) <= 30 ? j : (Number(idx) - 30 + j) % 30;
            const ts = Number(timestamps[bufIdx]);
            const pps = values[bufIdx];
            if (ts === 0 || pps === 0n) continue;

            if (ts <= thirtyDaysAgo) {
              const dist = thirtyDaysAgo - ts;
              if (dist < closest30dDist) {
                closest30dDist = dist;
                closest30d = pps;
              }
            }
          }

          if (closest30d !== null && closest30d > 0n) {
            returnSince30d = (Number(currentPps - closest30d) / Number(closest30d)) * 100;
          }
        }

        // Fallback: if no 30d checkpoint, use total return as approximation
        if (returnSince30d === null && initialPps > 0n) {
          returnSince30d = (Number(currentPps - initialPps) / Number(initialPps)) * 100;
        }

        result[addr] = { returnSince30d, maxDrawdown };
      }

      return result;
    },
    enabled: !!client && vaultAddresses.length > 0,
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/*  Batch agent metadata hook — for strategy tag filtering             */
/* ------------------------------------------------------------------ */

interface AgentMeta {
  strategy?: string;
  tags?: string[];
}

/** Convert `ipfs://` URIs to an HTTP gateway URL. */
function resolveUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return uri;
}

function useBatchAgentMetadata(agentIds: `0x${string}`[]) {
  const { contracts } = useNetwork();
  const { selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  // Deduplicate agent IDs
  const uniqueIds = useMemo(() => [...new Set(agentIds)], [agentIds]);

  return useQuery<Record<string, AgentMeta>>({
    queryKey: ['batchAgentMetadata', uniqueIds.join(',')],
    queryFn: async () => {
      if (!client || uniqueIds.length === 0 || !contracts?.agentRegistry) return {};

      // Fetch metadataURI for all agents via multicall
      const uriCalls = uniqueIds.map((id) => ({
        address: contracts.agentRegistry,
        abi: AgentRegistryABI,
        functionName: 'getMetadataURI' as const,
        args: [id] as const,
      }));

      let uriResults: any[] = [];
      try {
        uriResults = await client.multicall({ contracts: uriCalls });
      } catch {
        return {};
      }

      // Fetch JSON metadata for each valid URI
      const result: Record<string, AgentMeta> = {};
      const fetchPromises = uniqueIds.map(async (id, i) => {
        const r = uriResults[i];
        if (r?.status !== 'success' || !r.result || r.result === '') return;

        try {
          const url = resolveUri(r.result as string);
          const resp = await fetch(url);
          if (!resp.ok) return;
          const json = await resp.json();
          result[id.toLowerCase()] = {
            strategy: json.strategy,
            tags: json.tags,
          };
        } catch {
          // Skip failed fetches
        }
      });

      await Promise.allSettled(fetchPromises);
      return result;
    },
    enabled: !!client && uniqueIds.length > 0 && !!contracts?.agentRegistry,
    staleTime: 5 * 60 * 1000, // 5 min — metadata rarely changes
  });
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function VaultsPage() {
  // Capture ?ref= param from referral links and persist to localStorage
  useStoredReferralCode();

  const [searchAddress, setSearchAddress] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('tvl');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all');
  const [strategyFilter, setStrategyFilter] = useState<string | null>(null);

  const { data: deployedVaults, isLoading: isLoadingVaults, error: vaultsError } = useDeployedVaultsList();

  const vaultAddresses = useMemo(
    () => (deployedVaults ?? []).map((v) => v.address),
    [deployedVaults],
  );

  const { data: commentCounts } = useCommentCounts(vaultAddresses);

  // Batch performance data for sorting
  const { data: batchPerf } = useBatchPerformance(vaultAddresses);

  // Batch fee data (mgmt + perf bps) for card/row display
  const { data: batchFees } = useBatchFees(vaultAddresses);

  // Batch agent metadata for strategy filtering
  const agentIds = useMemo(
    () => (deployedVaults ?? []).map((v) => v.agentId as `0x${string}`),
    [deployedVaults],
  );
  const { data: batchMeta } = useBatchAgentMetadata(agentIds);

  // Collect unique strategy tags for the secondary filter
  const strategyTags = useMemo(() => {
    if (!batchMeta) return [];
    const tags = new Set<string>();
    for (const meta of Object.values(batchMeta)) {
      if (meta.strategy) tags.add(meta.strategy);
    }
    return [...tags].sort();
  }, [batchMeta]);

  // Filter + sort vaults
  const filteredAndSorted = useMemo(() => {
    if (!deployedVaults || deployedVaults.length === 0) return deployedVaults;

    // Step 1: Filter by protocol type
    let filtered = deployedVaults;
    if (protocolFilter !== 'all') {
      const filterDef = PROTOCOL_FILTERS.find((f) => f.key === protocolFilter);
      if (filterDef && filterDef.protocolType !== undefined) {
        filtered = filtered.filter((v) => (v.protocolType ?? 0) === filterDef.protocolType);
      }
    }

    // Step 2: Filter by strategy tag
    if (strategyFilter && batchMeta) {
      filtered = filtered.filter((v) => {
        const meta = batchMeta[v.agentId.toLowerCase()];
        return meta?.strategy === strategyFilter;
      });
    }

    // Step 3: Sort
    const indexed = filtered.map((v, i) => ({ ...v, _idx: i }));
    return [...indexed].sort((a, b) => {
      switch (sortBy) {
        case 'tvl':
          return a.totalValueLocked > b.totalValueLocked ? -1 : a.totalValueLocked < b.totalValueLocked ? 1 : 0;
        case 'balance':
          return a.totalAssets > b.totalAssets ? -1 : a.totalAssets < b.totalAssets ? 1 : 0;
        case 'newest':
          return b._idx - a._idx;
        case 'oldest':
          return a._idx - b._idx;
        case 'shares':
          return a.totalShares > b.totalShares ? -1 : a.totalShares < b.totalShares ? 1 : 0;
        case 'comments': {
          const ac = commentCounts?.[a.address.toLowerCase()] ?? 0;
          const bc = commentCounts?.[b.address.toLowerCase()] ?? 0;
          return bc - ac;
        }
        case 'returns': {
          const ar = batchPerf?.[a.address.toLowerCase()]?.returnSince30d ?? -Infinity;
          const br = batchPerf?.[b.address.toLowerCase()]?.returnSince30d ?? -Infinity;
          return br - ar; // Highest returns first
        }
        case 'drawdown': {
          // Lowest drawdown = closest to 0 (least negative). Nulls go last.
          const ad = batchPerf?.[a.address.toLowerCase()]?.maxDrawdown ?? null;
          const bd = batchPerf?.[b.address.toLowerCase()]?.maxDrawdown ?? null;
          if (ad === null && bd === null) return 0;
          if (ad === null) return 1;
          if (bd === null) return -1;
          return bd - ad; // Higher (closer to 0) is better
        }
        default:
          return 0;
      }
    });
  }, [deployedVaults, sortBy, commentCounts, protocolFilter, strategyFilter, batchPerf, batchMeta]);

  const vaultHex = searchAddress.startsWith('0x') && searchAddress.length === 42
    ? (searchAddress as `0x${string}`)
    : undefined;
  const { data: isDeployed, isLoading: isCheckingVault } = useIsDeployedVault(vaultHex);

  // Count vaults per protocol type for filter badges
  const protocolCounts = useMemo(() => {
    if (!deployedVaults) return {};
    const counts: Record<number, number> = {};
    for (const v of deployedVaults) {
      const pt = v.protocolType ?? 0;
      counts[pt] = (counts[pt] ?? 0) + 1;
    }
    return counts;
  }, [deployedVaults]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
      <VaultExplainer />

      {/* Header — editorial layout */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono"
          >
            Vault Factory
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#c4f547]">Execution</span>{' '}
          <span className="text-white">Vaults</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Browse and manage vaults for verifiable agent execution with ZK proofs.
        </p>
      </div>

      {/* Search + Controls bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        {/* Search */}
        <div className="flex-1">
          <div className="input-dark-wrapper">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              placeholder="Search by vault address (0x...)..."
              className="input-dark font-mono w-full pl-9 pr-10"
            />
            {searchAddress && (
              <button
                type="button"
                onClick={() => setSearchAddress('')}
                className="input-clear"
                aria-label="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Protocol type filter chips */}
      {!vaultHex && deployedVaults && deployedVaults.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {PROTOCOL_FILTERS.map((f) => {
              const isActive = protocolFilter === f.key;
              const count = f.key === 'all'
                ? deployedVaults.length
                : protocolCounts[f.protocolType ?? 0] ?? 0;

              return (
                <button
                  key={f.key}
                  onClick={() => {
                    setProtocolFilter(f.key);
                    // Clear strategy filter when changing protocol
                    if (f.key !== protocolFilter) setStrategyFilter(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all duration-200 border ${
                    isActive
                      ? `${filterChipColors(f.key, true)} border-white/10`
                      : `${filterChipColors(f.key, false)} border-transparent hover:border-white/5`
                  }`}
                >
                  {f.label}
                  {count > 0 && (
                    <span className={`ml-1.5 text-[10px] ${isActive ? 'opacity-70' : 'text-gray-600'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Strategy tag chips (secondary filter) */}
            {strategyTags.length > 0 && (
              <>
                <div className="w-px h-4 bg-white/10 mx-1" />
                {strategyTags.map((tag) => {
                  const isActive = strategyFilter === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => setStrategyFilter(isActive ? null : tag)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-medium transition-all duration-200 border ${
                        isActive
                          ? 'bg-violet-500/15 text-violet-400 border-violet-500/20 shadow-sm'
                          : 'text-gray-500 hover:text-gray-300 border-transparent hover:border-white/5'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Search result */}
      {vaultHex && !isCheckingVault && isDeployed !== undefined && (
        <div className="rounded-2xl border border-white/10 bg-[#12121a]/80 p-6 mb-8">
          {isDeployed ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="badge-success mb-2">Verified Vault</span>
                <p className="text-sm text-gray-400 font-mono mt-2">{searchAddress}</p>
              </div>
              <Link href={`/vaults/${searchAddress}`} className="btn-primary">
                View Vault
              </Link>
            </div>
          ) : (
            <div className="text-center py-4">
              <span className="badge-warning">Not a deployed vault</span>
              <p className="text-sm text-gray-500 font-mono mt-2">This address is not a vault deployed by the factory.</p>
            </div>
          )}
        </div>
      )}

      {/* Main vault listing */}
      {!vaultHex && (
        <>
          {/* Loading skeletons */}
          {isLoadingVaults && (
            <div>
              <div className="h-4 skeleton w-48 mb-6" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-5" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 skeleton rounded-full" />
                        <div className="w-16 h-4 skeleton rounded-md" />
                      </div>
                      <div className="w-20 h-4 skeleton rounded-full" />
                    </div>
                    <div className="mb-4">
                      <div className="w-16 h-2 skeleton rounded mb-2" />
                      <div className="w-32 h-7 skeleton rounded" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="h-12 skeleton rounded-lg" />
                      <div className="h-12 skeleton rounded-lg" />
                    </div>
                    <div className="flex justify-between">
                      <div className="w-28 h-3 skeleton rounded" />
                      <div className="w-20 h-3 skeleton rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vaultsError && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 text-center py-12 mb-8">
              <p className="text-red-400 font-mono text-sm">Failed to fetch vaults. Please try refreshing the page.</p>
            </div>
          )}

          {filteredAndSorted && filteredAndSorted.length > 0 && (
            <div>
              {/* Toolbar: count + sort + view toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
                <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                  {filteredAndSorted.length} vault{filteredAndSorted.length !== 1 ? 's' : ''}
                  {(protocolFilter !== 'all' || strategyFilter) && (
                    <span className="text-gray-600 ml-1">
                      (filtered)
                    </span>
                  )}
                </h2>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {/* Sort pills — horizontal scroll on mobile */}
                  <div className="flex items-center gap-1 bg-white/[0.02] rounded-lg p-0.5 border border-white/5 overflow-x-auto scrollbar-none flex-1 sm:flex-initial">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setSortBy(opt.key)}
                        className={`px-2.5 py-1.5 min-h-[44px] sm:min-h-0 sm:py-1 rounded-md text-[11px] font-mono transition-all duration-200 whitespace-nowrap ${
                          sortBy === opt.key
                            ? 'bg-[#c4f547]/15 text-[#d5f972] shadow-sm'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* View toggle — hidden on mobile (always grid) */}
                  <div className="hidden sm:flex items-center gap-0.5 bg-white/[0.02] rounded-lg p-0.5 border border-white/5">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded-md transition-all duration-200 ${
                        viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                      aria-label="Grid view"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                        <rect x="1" y="1" width="6" height="6" rx="1" />
                        <rect x="9" y="1" width="6" height="6" rx="1" />
                        <rect x="1" y="9" width="6" height="6" rx="1" />
                        <rect x="9" y="9" width="6" height="6" rx="1" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 rounded-md transition-all duration-200 ${
                        viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                      aria-label="List view"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                        <rect x="1" y="2" width="14" height="2.5" rx="0.5" />
                        <rect x="1" y="6.75" width="14" height="2.5" rx="0.5" />
                        <rect x="1" y="11.5" width="14" height="2.5" rx="0.5" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Grid view */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredAndSorted.map((v, i) => (
                    <VaultCard
                      key={v.address}
                      address={v.address}
                      agentId={v.agentId}
                      asset={v.asset}
                      totalAssets={v.totalAssets}
                      totalShares={v.totalShares}
                      totalValueLocked={v.totalValueLocked}
                      assetDecimals={v.assetDecimals}
                      assetSymbol={v.assetSymbol}
                      commentCount={commentCounts?.[v.address.toLowerCase()]}
                      isOptimistic={v.isOptimistic}
                      pendingCount={v.pendingCount}
                      protocolType={v.protocolType}
                      index={i}
                      managementFeeBps={batchFees?.[v.address.toLowerCase()]?.managementFeeBps}
                      performanceFeeBps={batchFees?.[v.address.toLowerCase()]?.performanceFeeBps}
                    />
                  ))}
                </div>
              )}

              {/* List view */}
              {viewMode === 'list' && (
                <div>
                  {/* Table header */}
                  <div className="flex items-center gap-4 px-5 py-2 text-[10px] font-mono uppercase tracking-wider text-gray-600 mb-1">
                    <div className="w-6" />
                    <div className="w-36 shrink-0">Address</div>
                    <div className="w-24 shrink-0">Type</div>
                    <div className="flex-1 text-right">TVL</div>
                    <div className="w-24 text-right shrink-0 hidden md:block">30d</div>
                    <div className="w-28 text-right shrink-0 hidden md:block">Fees</div>
                    <div className="w-32 text-right hidden lg:block">Balance</div>
                    <div className="w-20 text-right shrink-0">Info</div>
                    <div className="w-5 shrink-0" />
                  </div>
                  <div className="space-y-1.5">
                    {filteredAndSorted.map((v, i) => (
                      <VaultRow
                        key={v.address}
                        address={v.address}
                        agentId={v.agentId}
                        asset={v.asset}
                        totalAssets={v.totalAssets}
                        totalShares={v.totalShares}
                        totalValueLocked={v.totalValueLocked}
                        assetDecimals={v.assetDecimals}
                        assetSymbol={v.assetSymbol}
                        commentCount={commentCounts?.[v.address.toLowerCase()]}
                        isOptimistic={v.isOptimistic}
                        pendingCount={v.pendingCount}
                        protocolType={v.protocolType}
                        index={i}
                        managementFeeBps={batchFees?.[v.address.toLowerCase()]?.managementFeeBps}
                        performanceFeeBps={batchFees?.[v.address.toLowerCase()]?.performanceFeeBps}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state: all vaults filtered out */}
          {filteredAndSorted && filteredAndSorted.length === 0 && deployedVaults && deployedVaults.length > 0 && (
            <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-16">
              <div className="mb-4">
                <div className="w-12 h-12 mx-auto rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                  </svg>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-1">No vaults match current filters</p>
              <p className="text-gray-600 text-xs font-mono mb-4">Try adjusting the protocol type or strategy filter.</p>
              <button
                onClick={() => { setProtocolFilter('all'); setStrategyFilter(null); }}
                className="text-[11px] font-mono text-[#d5f972] hover:text-[#c4f547] transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Empty state: no vaults at all */}
          {filteredAndSorted && filteredAndSorted.length === 0 && (!deployedVaults || deployedVaults.length === 0) && !isLoadingVaults && (
            <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-20">
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-[#c4f547]/5 border border-[#c4f547]/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#c4f547]/40" fill="none" stroke="currentColor" strokeWidth="1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
                  </svg>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-1">No vaults deployed yet</p>
              <p className="text-gray-600 text-xs mb-6 font-mono">Be the first to deploy a vault for verifiable agent execution.</p>
              <a
                href="https://docs.tokagent.network"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 text-xs"
              >
                Read the Docs
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
