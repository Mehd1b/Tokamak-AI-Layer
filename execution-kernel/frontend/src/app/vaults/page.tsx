'use client';

import { useState } from 'react';
import { useIsDeployedVault, useDeployedVaultsList } from '@/hooks/useVaultFactory';
import { VaultCard } from '@/components/VaultCard';
import Link from 'next/link';

export default function VaultsPage() {
  const [searchAddress, setSearchAddress] = useState('');
  const { data: deployedVaults, isLoading: isLoadingVaults, error: vaultsError } = useDeployedVaultsList();

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
        <p className="text-gray-400 max-w-2xl" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Browse and manage vaults for verifiable agent execution with ZK proofs.
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <input
          type="text"
          value={searchAddress}
          onChange={(e) => setSearchAddress(e.target.value)}
          placeholder="Search by vault address (0x...)..."
          className="input-dark font-mono w-full"
        />
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
            <div className="card text-center py-12">
              <div className="animate-pulse text-[#A855F7] font-mono text-sm">Fetching on-chain vaults...</div>
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
              <p className="text-gray-500 font-mono text-sm">No vaults deployed yet</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
