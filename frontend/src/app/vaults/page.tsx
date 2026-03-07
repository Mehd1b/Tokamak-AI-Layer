'use client';

import { useState } from 'react';
import { useIsDeployedVault, useDeployedVaultsList } from '@/hooks/useVaultFactory';
import { useCommentCounts } from '@/hooks/useCommentCounts';
import { VaultCard } from '@/components/VaultCard';
import Link from 'next/link';

export default function VaultsPage() {
  const [searchAddress, setSearchAddress] = useState('');
  const { data: deployedVaults, isLoading: isLoadingVaults, error: vaultsError } = useDeployedVaultsList();

  const vaultAddresses = (deployedVaults ?? []).map((v) => v.address);
  const { data: commentCounts } = useCommentCounts(vaultAddresses);

  const vaultHex = searchAddress.startsWith('0x') && searchAddress.length === 42
    ? (searchAddress as `0x${string}`)
    : undefined;
  const { data: isDeployed, isLoading: isCheckingVault } = useIsDeployedVault(vaultHex);

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      {/* Header */}
      <div className="mb-12">
        <span
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-6"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          Vault Factory
        </span>
        <h1
          className="text-4xl md:text-5xl font-light mb-4"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Execution</span> Vaults
        </h1>
        <p className="text-gray-400 max-w-2xl leading-relaxed">
          Browse and manage vaults for verifiable agent execution with ZK proofs.
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <div className="input-dark-wrapper">
          <input
            type="text"
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            placeholder="Search by vault address (0x...)..."
            className="input-dark font-mono w-full pr-10"
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

      {/* Search result */}
      {vaultHex && !isCheckingVault && isDeployed !== undefined && (
        <div className="card mb-8">
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

      {/* On-chain deployed vaults */}
      {!vaultHex && (
        <>
          {isLoadingVaults && (
            <div>
              <div className="h-4 skeleton w-48 mb-4" />
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="card">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 skeleton rounded-xl" />
                      <div className="flex gap-2">
                        <div className="w-16 h-5 skeleton rounded" />
                        <div className="w-12 h-5 skeleton rounded" />
                      </div>
                    </div>
                    <div className="h-4 skeleton rounded w-2/3 mb-3" />
                    <div className="space-y-2">
                      <div className="h-3 skeleton rounded" />
                      <div className="h-3 skeleton rounded w-5/6" />
                      <div className="h-3 skeleton rounded w-4/6" />
                      <div className="h-3 skeleton rounded w-3/4" />
                      <div className="h-3 skeleton rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vaultsError && (
            <div className="card text-center py-12 mb-8">
              <p className="text-red-400 font-mono text-sm">Failed to fetch vaults: {vaultsError.message.slice(0, 120)}</p>
            </div>
          )}

          {deployedVaults && deployedVaults.length > 0 && (
            <div>
              <h2 className="text-sm font-mono text-gray-500 uppercase tracking-wider mb-4">
                Deployed Vaults ({deployedVaults.length} vault{deployedVaults.length !== 1 ? 's' : ''})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {deployedVaults.map((v) => (
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
                  />
                ))}
              </div>
            </div>
          )}

          {deployedVaults && deployedVaults.length === 0 && (
            <div className="card text-center py-16">
              <div className="mb-4">
                <svg viewBox="0 0 64 64" className="w-16 h-16 mx-auto opacity-30" fill="none">
                  <rect x="12" y="16" width="40" height="32" rx="4" stroke="#A855F7" strokeWidth="1.5" strokeOpacity="0.5" />
                  <circle cx="32" cy="32" r="10" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.4" />
                  <circle cx="32" cy="32" r="3" fill="#A855F7" fillOpacity="0.5" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm mb-2">No vaults deployed yet</p>
              <p className="text-gray-500 text-sm mb-6">Be the first to deploy a vault for verifiable agent execution.</p>
              <a
                href="https://docs.tokagent.network"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-2"
              >
                Read the Docs
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
