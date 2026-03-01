'use client';

import { useParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useVaultInfo, useVaultShares } from '@/hooks/useKernelVault';
import { useVaultHistory } from '@/hooks/useVaultHistory';
import { useVaultExecutions } from '@/hooks/useVaultExecutions';
import { VaultDepositForm } from '@/components/VaultDepositForm';
import { VaultWithdrawForm } from '@/components/VaultWithdrawForm';
import { VaultChart } from '@/components/VaultChart';
import { ExecutionSubmitForm } from '@/components/ExecutionSubmitForm';
import { ExecutionHistoryTable } from '@/components/ExecutionHistoryTable';
import { formatBytes32, formatEther, timestampToDate, truncateAddress } from '@/lib/utils';
import { useNetwork } from '@/lib/NetworkContext';
import { NetworkBadge } from '@/components/NetworkLogo';
import { CommentSection } from '@/components/CommentSection';
import Link from 'next/link';

export default function VaultDetailPage() {
  const params = useParams();
  const vaultAddress = params.address as `0x${string}`;
  const { address: userAddress } = useAccount();

  const { explorerUrl } = useNetwork();
  const vault = useVaultInfo(vaultAddress);
  const { data: userShares } = useVaultShares(vaultAddress, userAddress);
  const { tvl, pps, isLoading: historyLoading } = useVaultHistory(vaultAddress, vault.assetDecimals);
  const { executions, isLoading: executionsLoading } = useVaultExecutions(vaultAddress);

  if (vault.isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
        <div className="card animate-pulse">
          <div className="h-8 bg-white/5 rounded w-1/3 mb-4" />
          <div className="h-4 bg-white/5 rounded w-2/3 mb-2" />
          <div className="h-4 bg-white/5 rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
      {/* Back button */}
      <Link href="/vaults" className="inline-flex items-center gap-2 text-gray-400 hover:text-[#A855F7] transition-colors mb-8 font-mono text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Vaults
      </Link>

      {/* Two-column layout: main content left, discussion right */}
      <div className="flex flex-col xl:flex-row gap-8">
        {/* Left column — vault content */}
        <div className="flex-1 min-w-0">
          {/* Actions grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Deposit */}
            <div className="card">
              <h2 className="text-lg font-light text-white mb-4" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Deposit
              </h2>
              <VaultDepositForm
                vaultAddress={vaultAddress}
                isEthVault={vault.isEthVault}
                assetDecimals={vault.assetDecimals}
                assetSymbol={vault.assetSymbol}
                assetAddress={vault.asset as `0x${string}` | undefined}
              />
            </div>

            {/* Withdraw */}
            <div className="card">
              <h2 className="text-lg font-light text-white mb-4" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Withdraw
              </h2>
              <VaultWithdrawForm vaultAddress={vaultAddress} assetDecimals={vault.assetDecimals} />
            </div>
          </div>

          {/* Vault header */}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                  Vault Detail
                </h1>
                <div className="flex items-center gap-2">
                  <span className="badge-info">
                    {truncateAddress(vaultAddress, 6)}
                  </span>
                  <NetworkBadge />
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="space-y-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                <span className="text-gray-500 text-sm">Address</span>
                <a
                  href={`${explorerUrl}/address/${vaultAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#A855F7] text-sm hover:underline break-all"
                >
                  {vaultAddress}
                </a>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                <span className="text-gray-500 text-sm">Agent ID</span>
                <span className="text-gray-300 text-sm break-all">{vault.agentId ? String(vault.agentId) : '-'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                <span className="text-gray-500 text-sm">Asset</span>
                <span className="text-gray-300 text-sm break-all">{vault.asset ? String(vault.asset) : '-'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                <span className="text-gray-500 text-sm">Trusted Image ID</span>
                <span className="text-gray-300 text-sm break-all">{vault.trustedImageId ? String(vault.trustedImageId) : '-'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                <span className="text-gray-500 text-sm">Vault Balance</span>
                <span className="text-gray-300 text-sm">{vault.totalAssets !== undefined ? `${formatEther(vault.totalAssets, vault.assetDecimals)} ${vault.assetSymbol}` : '-'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                <span className="text-gray-500 text-sm">Total Shares</span>
                <span className="text-gray-300 text-sm">{vault.totalShares !== undefined ? formatEther(vault.totalShares, vault.assetDecimals) : '-'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                <span className="text-gray-500 text-sm">Last Execution Nonce</span>
                <span className="text-gray-300 text-sm">{vault.lastExecutionNonce !== undefined ? vault.lastExecutionNonce.toString() : '-'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between py-3">
                <span className="text-gray-500 text-sm">Last Execution</span>
                <span className="text-gray-300 text-sm">
                  {vault.lastExecutionTimestamp !== undefined ? timestampToDate(vault.lastExecutionTimestamp) : '-'}
                </span>
              </div>
            </div>

            {userAddress && userShares !== undefined && (
              <div className="mt-6 p-4 rounded-lg border border-[#A855F7]/20 bg-[#A855F7]/5">
                <span className="text-gray-400 text-sm font-mono">Your Shares: </span>
                <span className="text-[#A855F7] text-sm font-mono">{formatEther(userShares, vault.assetDecimals)}</span>
              </div>
            )}
          </div>

          {/* TVL & PPS Charts */}
          <div className="grid grid-cols-1 gap-6 mb-8">
            <VaultChart
              title="Total Value Locked"
              data={tvl}
              type="area"
              valueSuffix={vault.assetSymbol}
              precision={4}
              isLoading={historyLoading}
              height={300}
            />
            <VaultChart
              title="Price Per Share"
              data={pps}
              type="line"
              precision={6}
              isLoading={historyLoading}
              height={250}
            />
          </div>

          {/* Execution History */}
          <div className="card">
            <h2 className="text-lg font-light text-white mb-4" style={{ fontFamily: 'var(--font-serif), serif' }}>
              Execution History
            </h2>
            <p className="text-gray-500 text-sm font-mono mb-4">
              Last 10 verified executions for this vault.
            </p>
            {executionsLoading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 bg-white/5 rounded" />
                ))}
              </div>
            ) : (
              <ExecutionHistoryTable executions={executions} />
            )}
          </div>
        </div>

        {/* Right column — Discussion (sticky on desktop) */}
        <div className="xl:w-[400px] flex-shrink-0">
          <div className="xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)] xl:overflow-y-auto xl:scrollbar-thin">
            <CommentSection vaultAddress={vaultAddress} vaultOwner={vault.owner} />
          </div>
        </div>
      </div>
    </div>
  );
}
