'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useAgent, useUnregisterAgent } from '@/hooks/useKernelAgent';
import { useVaultsForAgent } from '@/hooks/useVaultFactory';
import { VaultCard } from '@/components/VaultCard';
import { formatBytes32, truncateAddress } from '@/lib/utils';
import { useNetwork } from '@/lib/NetworkContext';
import { NetworkBadge } from '@/components/NetworkLogo';
import Link from 'next/link';
import { useEffect } from 'react';

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as `0x${string}`;
  const { address: userAddress } = useAccount();
  const { data: agent, isLoading, error } = useAgent(agentId);
  const { data: associatedVaults, isLoading: isLoadingVaults } = useVaultsForAgent(agentId);
  const {
    unregisterAgent,
    isPending: isUnregPending,
    isConfirming: isUnregConfirming,
    isSuccess: isUnregSuccess,
    error: unregError,
  } = useUnregisterAgent();

  const { explorerUrl } = useNetwork();
  const isAuthor = userAddress && agent && userAddress.toLowerCase() === (agent.author as string).toLowerCase();
  const hasVaultDeposits = associatedVaults && associatedVaults.some((v) => v.totalAssets > BigInt(0));

  useEffect(() => {
    if (isUnregSuccess) {
      const timeout = setTimeout(() => router.push('/agents'), 1500);
      return () => clearTimeout(timeout);
    }
  }, [isUnregSuccess, router]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
        <div className="card animate-pulse">
          <div className="h-8 bg-white/5 rounded w-1/3 mb-4" />
          <div className="h-4 bg-white/5 rounded w-2/3 mb-2" />
          <div className="h-4 bg-white/5 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
        <div className="card text-center py-12">
          <p className="text-red-400 font-mono text-sm mb-4">Agent not found</p>
          <Link href="/agents" className="btn-secondary">
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
      {/* Back button */}
      <Link href="/agents" className="inline-flex items-center gap-2 text-gray-400 hover:text-[#A855F7] transition-colors mb-8 font-mono text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Agents
      </Link>

      {/* Agent header */}
      <div className="card mb-8">
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#A855F7]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
              Agent Detail
            </h1>
            <div className="flex items-center gap-2">
              <span className={agent.exists ? 'badge-success' : 'badge-error'}>
                {agent.exists ? 'Active' : 'Inactive'}
              </span>
              <NetworkBadge />
            </div>
          </div>
        </div>

        <div className="space-y-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
            <span className="text-gray-500 text-sm">Agent ID</span>
            <span className="text-[#A855F7] text-sm break-all">{agentId}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
            <span className="text-gray-500 text-sm">Author</span>
            <a
              href={`${explorerUrl}/address/${agent.author}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 text-sm hover:text-[#A855F7] transition-colors"
            >
              {agent.author}
            </a>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
            <span className="text-gray-500 text-sm">Agent Code Hash</span>
            <span className="text-gray-300 text-sm break-all">{agent.agentCodeHash}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3">
            <span className="text-gray-500 text-sm">Image ID</span>
            <span className="text-gray-300 text-sm break-all">{agent.imageId}</span>
          </div>
        </div>
      </div>

      {/* Unregister Agent */}
      {isAuthor && (
        <div className="card mb-8">
          <h2
            className="text-xl font-light text-white mb-4"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            Danger Zone
          </h2>
          <p className="text-gray-400 text-sm font-mono mb-4">
            Unregistering will permanently remove this agent and close all associated vaults.
          </p>

          {isUnregSuccess ? (
            <p className="text-green-400 font-mono text-sm">Agent unregistered. Redirecting...</p>
          ) : hasVaultDeposits ? (
            <p className="text-yellow-400/80 font-mono text-sm">
              Cannot unregister: one or more vaults still have active deposits. Withdraw all funds first.
            </p>
          ) : (
            <>
              <button
                onClick={() => {
                  const vaultAddresses = (associatedVaults ?? []).map((v) => v.address as `0x${string}`);
                  unregisterAgent(agentId, vaultAddresses);
                }}
                disabled={isUnregPending || isUnregConfirming}
                className="px-6 py-2.5 rounded-lg font-mono text-sm transition-all duration-200 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUnregPending ? 'Signing...' : isUnregConfirming ? 'Confirming...' : 'Unregister Agent'}
              </button>
              {unregError && (
                <p className="text-red-400 font-mono text-sm mt-3">
                  {(unregError as Error).message?.split('\n')[0] || 'Transaction failed'}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Associated Vaults */}
      <div className="card">
        <h2
          className="text-xl font-light text-white mb-6"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          Associated Vaults
        </h2>

        {isLoadingVaults && (
          <div className="text-center py-8">
            <div className="animate-pulse text-[#A855F7] font-mono text-sm">Fetching vaults...</div>
          </div>
        )}

        {associatedVaults && associatedVaults.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6">
            {associatedVaults.map((v) => (
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
        )}

        {associatedVaults && associatedVaults.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 font-mono text-sm mb-4">
              No vaults deployed for this agent yet.
            </p>
            <Link href="/vaults" className="btn-primary">
              Deploy Vault
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
