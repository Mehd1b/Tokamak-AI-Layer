'use client';

import { useState, useMemo } from 'react';
import { useIsDeployedVault, useDeployedVaultsList } from '@/hooks/useVaultFactory';
import { useCommentCounts } from '@/hooks/useCommentCounts';
import { VaultCard, VaultRow } from '@/components/VaultCard';
import { VaultExplainer } from '@/components/VaultExplainer';
import Link from 'next/link';

type SortKey = 'tvl' | 'balance' | 'newest' | 'oldest' | 'shares' | 'comments';
type ViewMode = 'grid' | 'list';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'tvl', label: 'TVL' },
  { key: 'balance', label: 'Balance' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'shares', label: 'Shares' },
  { key: 'comments', label: 'Comments' },
];

export default function VaultsPage() {
  const [searchAddress, setSearchAddress] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('tvl');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const { data: deployedVaults, isLoading: isLoadingVaults, error: vaultsError } = useDeployedVaultsList();

  const vaultAddresses = (deployedVaults ?? []).map((v) => v.address);
  const { data: commentCounts } = useCommentCounts(vaultAddresses);

  const sortedVaults = useMemo(() => {
    if (!deployedVaults || deployedVaults.length === 0) return deployedVaults;
    const indexed = deployedVaults.map((v, i) => ({ ...v, _idx: i }));
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
        default:
          return 0;
      }
    });
  }, [deployedVaults, sortBy, commentCounts]);

  const vaultHex = searchAddress.startsWith('0x') && searchAddress.length === 42
    ? (searchAddress as `0x${string}`)
    : undefined;
  const { data: isDeployed, isLoading: isCheckingVault } = useIsDeployedVault(vaultHex);

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      <VaultExplainer />

      {/* Header — editorial layout */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono"
          >
            Vault Factory
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Execution</span>{' '}
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
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
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

          {sortedVaults && sortedVaults.length > 0 && (
            <div>
              {/* Toolbar: count + sort + view toggle */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                  {sortedVaults.length} vault{sortedVaults.length !== 1 ? 's' : ''}
                </h2>

                <div className="flex items-center gap-3">
                  {/* Sort pills */}
                  <div className="flex items-center gap-1 bg-white/[0.02] rounded-lg p-0.5 border border-white/5">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setSortBy(opt.key)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all duration-200 ${
                          sortBy === opt.key
                            ? 'bg-[#A855F7]/15 text-[#C084FC] shadow-sm'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* View toggle */}
                  <div className="flex items-center gap-0.5 bg-white/[0.02] rounded-lg p-0.5 border border-white/5">
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
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {sortedVaults.map((v, i) => (
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
                    <div className="w-32 text-right hidden lg:block">Balance</div>
                    <div className="w-20 text-right shrink-0">Info</div>
                    <div className="w-5 shrink-0" />
                  </div>
                  <div className="space-y-1.5">
                    {sortedVaults.map((v, i) => (
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
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {sortedVaults && sortedVaults.length === 0 && (
            <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-20">
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-[#A855F7]/5 border border-[#A855F7]/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#A855F7]/40" fill="none" stroke="currentColor" strokeWidth="1">
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
