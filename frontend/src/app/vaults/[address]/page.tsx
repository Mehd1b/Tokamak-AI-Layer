'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { useVaultInfo, useVaultShares } from '@/hooks/useKernelVault';
import { useVaultHistory } from '@/hooks/useVaultHistory';
import { useVaultExecutions } from '@/hooks/useVaultExecutions';
import { useVaultProtocolType } from '@/hooks/useVaultProtocolType';
import { VaultDepositForm } from '@/components/VaultDepositForm';
import { VaultWithdrawForm } from '@/components/VaultWithdrawForm';
import { VaultChart } from '@/components/VaultChart';
import { ExecutionSubmitForm } from '@/components/ExecutionSubmitForm';
import { ExecutionHistoryTable } from '@/components/ExecutionHistoryTable';
import { OptimisticStatusCard } from '@/components/OptimisticStatusCard';
import { ProtocolPositionSection } from '@/components/ProtocolPositionSection';
import { protocolLabel, protocolColor, PROTOCOL_TYPE } from '@/lib/protocolTypes';
import { formatBytes32, formatEther, timestampToDate, truncateAddress } from '@/lib/utils';
import { useNetwork } from '@/lib/NetworkContext';
import { NetworkBadge } from '@/components/NetworkLogo';
import { NetworkBanner } from '@/components/NetworkBanner';
import { DepositStepper } from '@/components/DepositStepper';
import { PostDepositConfirmation } from '@/components/PostDepositConfirmation';
import { CommentSection } from '@/components/CommentSection';
import { PerformanceCard } from '@/components/PerformanceCard';
import { DeprecationBanner } from '@/components/DeprecationBanner';
import { StrategyStatusBanner } from '@/components/StrategyStatusBanner';
import { BondStatusCard } from '@/components/BondStatusCard';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useAgent } from '@/hooks/useKernelAgent';
import Link from 'next/link';

const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

export default function VaultDetailPage() {
  const params = useParams();
  const vaultAddress = params.address as `0x${string}`;
  const { address: userAddress } = useAccount();

  const { explorerUrl, contracts, selectedChainId } = useNetwork();
  const vault = useVaultInfo(vaultAddress);
  const protocolType = useVaultProtocolType(vaultAddress);
  const { data: userShares } = useVaultShares(vaultAddress, userAddress);
  const { tvl, pps, isLoading: historyLoading } = useVaultHistory(vaultAddress, vault.assetDecimals);
  const { executions, isLoading: executionsLoading } = useVaultExecutions(vaultAddress);

  // Agent metadata for profile display
  const agentIdHex = vault.agentId ? (String(vault.agentId) as `0x${string}`) : undefined;
  const { data: agentMetadata, isLoading: metadataLoading } = useAgentMetadata(agentIdHex);
  const { data: agentInfo } = useAgent(agentIdHex);

  // State for PostDepositConfirmation
  const [depositConfirmation, setDepositConfirmation] = useState<{
    show: boolean;
    sharesMinted: bigint;
  }>({ show: false, sharesMinted: 0n });

  // Fetch user balance for DepositStepper
  const assetAddr = vault.asset as `0x${string}` | undefined;
  const { data: nativeBalance } = useBalance({
    address: userAddress,
    chainId: selectedChainId,
    query: { enabled: vault.isEthVault && !!userAddress },
  });
  const { data: rawTokenBalance } = useReadContract({
    address: assetAddr,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    chainId: selectedChainId,
    query: { enabled: !vault.isEthVault && !!assetAddr && !!userAddress },
  });
  const userBalanceBigInt: bigint = vault.isEthVault
    ? (nativeBalance?.value ?? 0n)
    : (typeof rawTokenBalance === 'bigint' ? rawTokenBalance : 0n);

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
      {/* Breadcrumbs */}
      <nav className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <Link href="/vaults">Vaults</Link>
        <span className="separator">/</span>
        <span className="text-gray-400">{truncateAddress(vaultAddress, 6)}</span>
      </nav>

      {/* Network mismatch banner */}
      <NetworkBanner expectedChainId={selectedChainId} chainName={selectedChainId === 999 ? 'HyperEVM' : undefined} />

      {/* Disclaimer */}
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
        <p className="text-xs text-red-400 leading-relaxed" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          <span className="font-bold uppercase">Disclaimer:</span> Vaults use smart contracts and AI agents that execute autonomous strategies. You may lose some or all of your deposited funds. Do not deposit more than you can afford to lose. This is not financial advice.
        </p>
      </div>

      {/* Two-column layout: main content left, discussion right */}
      <div className="flex flex-col xl:flex-row gap-8">
        {/* Left column — vault content */}
        <div className="flex-1 min-w-0">
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
                  {agentMetadata?.name ?? 'Vault Detail'}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge-info">
                    {truncateAddress(vaultAddress, 6)}
                  </span>
                  <NetworkBadge />
                  {vault.isOptimistic && (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                      Optimistic Vault
                    </span>
                  )}
                  {protocolType !== PROTOCOL_TYPE.GENERIC && (() => {
                    const colors = protocolColor(protocolType);
                    return (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
                        {protocolLabel(protocolType)}
                      </span>
                    );
                  })()}
                  {agentMetadata?.strategy && (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-violet-500/10 text-violet-400 border-violet-500/20">
                      {agentMetadata.strategy}
                    </span>
                  )}
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
                <span className="text-gray-500 text-sm">Agent</span>
                <span className="text-gray-300 text-sm break-all">
                  {vault.agentId ? (
                    <>
                      {agentMetadata?.name && (
                        <span className="text-white font-medium mr-2">{agentMetadata.name}</span>
                      )}
                      <span className="text-gray-500">{String(vault.agentId)}</span>
                    </>
                  ) : '-'}
                </span>
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

          {/* Agent Profile Card */}
          {agentIdHex && (agentMetadata || metadataLoading) && (
            <div className="card mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'rgba(168, 85, 247, 0.08)',
                    border: '1px solid rgba(168, 85, 247, 0.15)',
                  }}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#A855F7]" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </div>
                <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                  Agent Profile
                </h2>
              </div>

              {metadataLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-white/5 rounded w-1/3" />
                  <div className="h-3 bg-white/5 rounded w-2/3" />
                </div>
              ) : agentMetadata ? (
                <div className="space-y-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                  {agentMetadata.name && (
                    <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                      <span className="text-gray-500 text-sm">Name</span>
                      <span className="text-white text-sm font-medium">{agentMetadata.name}</span>
                    </div>
                  )}
                  {agentMetadata.description && (
                    <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                      <span className="text-gray-500 text-sm shrink-0 mr-4">Description</span>
                      <span className="text-gray-300 text-sm text-right">{agentMetadata.description}</span>
                    </div>
                  )}
                  {agentMetadata.strategy && (
                    <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                      <span className="text-gray-500 text-sm">Strategy</span>
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-violet-500/10 text-violet-400 border-violet-500/20">
                        {agentMetadata.strategy}
                      </span>
                    </div>
                  )}
                  {agentMetadata.author && (
                    <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                      <span className="text-gray-500 text-sm">Author</span>
                      {agentMetadata.authorUrl ? (
                        <a
                          href={agentMetadata.authorUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#A855F7] text-sm hover:underline"
                        >
                          {agentMetadata.author}
                        </a>
                      ) : (
                        <span className="text-gray-300 text-sm">{agentMetadata.author}</span>
                      )}
                    </div>
                  )}
                  {/* On-chain author address from registry */}
                  {agentInfo && (agentInfo as any).author && (
                    <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                      <span className="text-gray-500 text-sm">Registered By</span>
                      <a
                        href={`${explorerUrl}/address/${(agentInfo as any).author}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#A855F7] text-sm hover:underline break-all"
                      >
                        {truncateAddress((agentInfo as any).author, 6)}
                      </a>
                    </div>
                  )}
                  {agentMetadata.sourceRepo && (
                    <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
                      <span className="text-gray-500 text-sm">Source</span>
                      <a
                        href={agentMetadata.sourceRepo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#A855F7] text-sm hover:underline truncate max-w-[300px]"
                      >
                        {agentMetadata.sourceRepo.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    </div>
                  )}
                  {agentMetadata.version && (
                    <div className="flex flex-col sm:flex-row sm:justify-between py-3">
                      <span className="text-gray-500 text-sm">Version</span>
                      <span className="text-gray-300 text-sm">{agentMetadata.version}</span>
                    </div>
                  )}
                  {agentMetadata.tags && agentMetadata.tags.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:justify-between py-3">
                      <span className="text-gray-500 text-sm">Tags</span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {agentMetadata.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium bg-white/5 text-gray-400 border-white/10"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-600 text-sm font-mono">No metadata published for this agent.</p>
              )}
            </div>
          )}

          {/* Deprecation Warning */}
          {vault.agentId && (
            <div className="mb-8">
              <DeprecationBanner
                agentId={String(vault.agentId) as `0x${string}`}
                registryAddress={contracts.agentRegistry as `0x${string}`}
              />
            </div>
          )}

          {/* Strategy Status Warning */}
          <StrategyStatusBanner
            vaultAddress={vaultAddress}
            assetDecimals={vault.assetDecimals}
            assetSymbol={vault.assetSymbol}
          />

          {/* Performance Dashboard */}
          <PerformanceCard vaultAddress={vaultAddress} />

          {/* Optimistic Status (only for optimistic vaults) */}
          {vault.isOptimistic && (
            <OptimisticStatusCard
              optimisticEnabled={vault.isOptimistic}
              challengeWindow={vault.challengeWindow}
              minBond={vault.minBond}
              maxPending={vault.maxPending}
              pendingCount={vault.pendingCount}
              bondManagerAddress={vault.bondManagerAddress}
            />
          )}

          {/* Bond & Slash Transparency (only for optimistic vaults) */}
          {vault.isOptimistic && vault.bondManagerAddress && (
            <BondStatusCard
              bondManagerAddress={vault.bondManagerAddress}
              minBond={vault.minBond}
              challengeWindow={vault.challengeWindow}
            />
          )}

          {/* Protocol-specific positions */}
          <ProtocolPositionSection vaultAddress={vaultAddress} protocolType={protocolType} />

          {/* Key Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="card text-center py-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Balance</div>
              <div className="text-lg font-medium text-white font-mono">
                {vault.totalAssets !== undefined
                  ? formatEther(vault.totalAssets, vault.assetDecimals)
                  : '-'}{' '}
                <span className="text-sm text-gray-400">{vault.assetSymbol}</span>
              </div>
            </div>
            <div className="card text-center py-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Shares</div>
              <div className="text-lg font-medium text-white font-mono">
                {vault.totalShares !== undefined ? formatEther(vault.totalShares, vault.assetDecimals) : '-'}
              </div>
            </div>
            <div className="card text-center py-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Executions</div>
              <div className="text-lg font-medium text-white font-mono">
                {vault.lastExecutionNonce !== undefined ? vault.lastExecutionNonce.toString() : '0'}
              </div>
            </div>
            <div className="card text-center py-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Last Run</div>
              <div className="text-lg font-medium text-white font-mono">
                {vault.lastExecutionTimestamp !== undefined && vault.lastExecutionTimestamp > BigInt(0)
                  ? timestampToDate(vault.lastExecutionTimestamp)
                  : 'Never'}
              </div>
            </div>
          </div>

          {/* Deposit & Withdraw */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <h2 className="text-lg font-light text-white mb-4" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Deposit
              </h2>
              {depositConfirmation.show ? (
                <PostDepositConfirmation
                  sharesMinted={depositConfirmation.sharesMinted}
                  assetSymbol={vault.assetSymbol}
                  assetDecimals={vault.assetDecimals}
                  txHash={'0x0' as `0x${string}`}
                  explorerUrl={undefined}
                  onDismiss={() => setDepositConfirmation({ show: false, sharesMinted: 0n })}
                />
              ) : assetAddr && !vault.isEthVault ? (
                <DepositStepper
                  vaultAddress={vaultAddress}
                  asset={assetAddr}
                  assetSymbol={vault.assetSymbol}
                  assetDecimals={vault.assetDecimals}
                  userBalance={userBalanceBigInt}
                  onSuccess={(sharesMinted) => setDepositConfirmation({ show: true, sharesMinted })}
                />
              ) : (
                <VaultDepositForm
                  vaultAddress={vaultAddress}
                  isEthVault={vault.isEthVault}
                  assetDecimals={vault.assetDecimals}
                  assetSymbol={vault.assetSymbol}
                  assetAddress={vault.asset as `0x${string}` | undefined}
                />
              )}
            </div>
            <div className="card">
              <h2 className="text-lg font-light text-white mb-4" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Withdraw
              </h2>
              <VaultWithdrawForm
                vaultAddress={vaultAddress}
                assetDecimals={vault.assetDecimals}
                assetSymbol={vault.assetSymbol}
                userShares={userShares as bigint | undefined}
                totalShares={vault.totalShares as bigint | undefined}
                totalAssets={vault.totalAssets as bigint | undefined}
              />
            </div>
          </div>

          {/* Balance & PPS Charts */}
          <div className="grid grid-cols-1 gap-6 mb-8">
            <VaultChart
              title="Vault Balance"
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
              All verified executions for this vault.
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
          <div className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:scrollbar-thin">
            <CommentSection vaultAddress={vaultAddress} vaultOwner={vault.owner} />
          </div>
        </div>
      </div>
    </div>
  );
}
