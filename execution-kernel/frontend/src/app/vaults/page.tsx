'use client';

import { useState } from 'react';
import { useDeployVault, useIsDeployedVault, useDeployedVaultsList } from '@/hooks/useVaultFactory';
import { VaultCard } from '@/components/VaultCard';
import { isValidBytes32 } from '@/lib/utils';
import Link from 'next/link';

export default function VaultsPage() {
  const [showDeploy, setShowDeploy] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [asset, setAsset] = useState('');
  const [userSalt, setUserSalt] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const { deploy, isPending, isConfirming, isSuccess, hash, error } = useDeployVault();
  const { data: deployedVaults, isLoading: isLoadingVaults, error: vaultsError } = useDeployedVaultsList();

  const vaultHex = searchAddress.startsWith('0x') && searchAddress.length === 42
    ? (searchAddress as `0x${string}`)
    : undefined;
  const { data: isDeployed, isLoading: isCheckingVault } = useIsDeployedVault(vaultHex);

  const canDeploy = isValidBytes32(agentId) && asset.startsWith('0x') && asset.length === 42 && isValidBytes32(userSalt);

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDeploy) return;
    deploy(
      agentId as `0x${string}`,
      asset as `0x${string}`,
      userSalt as `0x${string}`,
    );
  };

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
          Deploy and manage vaults for verifiable agent execution with ZK proofs.
        </p>
      </div>

      {/* Search + Deploy toggle */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <input
          type="text"
          value={searchAddress}
          onChange={(e) => setSearchAddress(e.target.value)}
          placeholder="Search by vault address (0x...)..."
          className="input-dark font-mono flex-1"
        />
        <button
          onClick={() => setShowDeploy(!showDeploy)}
          className={showDeploy ? 'btn-secondary' : 'btn-primary'}
        >
          {showDeploy ? 'Cancel' : 'Deploy Vault'}
        </button>
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

      {/* Deploy form */}
      {showDeploy && (
        <div className="card mb-8">
          <h2
            className="text-xl font-light mb-6 text-white"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            Deploy New Vault
          </h2>
          <form onSubmit={handleDeploy} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1 font-mono">Agent ID (bytes32)</label>
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="0x..."
                className="input-dark font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1 font-mono">Asset Address</label>
              <input
                type="text"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                placeholder="0x... (use 0x0000...0000 for native ETH)"
                className="input-dark font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1 font-mono">Salt (bytes32)</label>
              <input
                type="text"
                value={userSalt}
                onChange={(e) => setUserSalt(e.target.value)}
                placeholder="0x..."
                className="input-dark font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={!canDeploy || isPending || isConfirming}
              className="btn-primary w-full"
            >
              {isPending ? 'Signing...' : isConfirming ? 'Deploying...' : 'Deploy Vault'}
            </button>
            {isSuccess && hash && (
              <div className="text-emerald-400 text-sm font-mono">
                Vault deployed!{' '}
                <a
                  href={`https://sepolia.etherscan.io/tx/${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-emerald-300"
                >
                  View transaction
                </a>
              </div>
            )}
            {error && (
              <p className="text-red-400 text-sm font-mono">{error.message.slice(0, 100)}</p>
            )}
          </form>
        </div>
      )}

      {/* On-chain deployed vaults */}
      {!vaultHex && !showDeploy && (
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
              <p className="text-gray-500 font-mono text-sm mb-2">No vaults deployed yet</p>
              <p className="text-gray-600 font-mono text-xs">Deploy the first vault above</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
