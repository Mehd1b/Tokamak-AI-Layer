'use client';

import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { OptimisticKernelVaultABI } from '@/lib/contracts';
import { formatEther, formatCountdown, truncateBytes32 } from '@/lib/utils';
import { useNetwork } from '@/lib/NetworkContext';
import type { OptimisticExecution } from '@/hooks/useOptimisticExecutions';

function StatusBadge({ status }: { status: OptimisticExecution['status'] }) {
  const styles = {
    pending: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    finalized: 'bg-green-500/10 text-green-400 border-green-500/20',
    slashed: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const labels = { pending: 'Pending', finalized: 'Finalized', slashed: 'Slashed' };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function CountdownCell({ deadline }: { deadline: bigint }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = Number(deadline) - now;
  const isExpired = remaining <= 0;
  const isRed = remaining > 0 && remaining < 20 * 60;
  const isYellow = remaining >= 20 * 60 && remaining < 60 * 60;

  if (isExpired) {
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400 border-red-500/20">
        SLASHABLE
      </span>
    );
  }

  const color = isRed ? 'text-red-400' : isYellow ? 'text-yellow-400' : 'text-green-400';

  return (
    <span className={`${color} text-sm`} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatCountdown(remaining)}
    </span>
  );
}

function SlashButton({ vaultAddress, nonce, deadline }: { vaultAddress: `0x${string}`; nonce: bigint; deadline: bigint }) {
  const { selectedChainId } = useNetwork();
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash, chainId: selectedChainId });

  const now = Math.floor(Date.now() / 1000);
  const isExpired = now >= Number(deadline);

  if (!isExpired) return null;

  return (
    <button
      onClick={() => {
        writeContract({
          address: vaultAddress,
          abi: OptimisticKernelVaultABI,
          functionName: 'slashExpired',
          args: [nonce],
          chainId: selectedChainId,
        });
      }}
      disabled={isPending || isConfirming}
      className="text-xs px-3 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
    >
      {isPending || isConfirming ? 'Slashing...' : 'Slash'}
    </button>
  );
}

interface PendingExecutionsTableProps {
  vaultAddress: `0x${string}`;
  executions: OptimisticExecution[];
}

export function PendingExecutionsTable({ vaultAddress, executions }: PendingExecutionsTableProps) {
  const { explorerUrl } = useNetwork();

  if (executions.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-500 font-mono text-sm">No optimistic executions found</p>
      </div>
    );
  }

  // Detect two-phase groupings: consecutive nonces within 2 of each other
  const twoPhaseGroups = new Set<string>();
  for (let i = 0; i < executions.length - 1; i++) {
    const a = executions[i];
    const b = executions[i + 1];
    if (b.executionNonce - a.executionNonce === BigInt(1) && a.status === b.status) {
      twoPhaseGroups.add(String(a.executionNonce));
      twoPhaseGroups.add(String(b.executionNonce));
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ fontFamily: 'var(--font-mono), monospace' }}>
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Nonce</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Bond</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Deadline</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Time Left</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Status</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Tx</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Action</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((exec) => {
            const nonceStr = String(exec.executionNonce);
            const isGrouped = twoPhaseGroups.has(nonceStr);

            return (
              <tr key={nonceStr} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {isGrouped && (
                      <div className="w-0.5 h-4 bg-[#A855F7]/40 rounded-full" />
                    )}
                    <span className="text-[#A855F7]">#{nonceStr}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-300">{formatEther(exec.bondAmount, 18)} WSTON</td>
                <td className="py-3 px-4 text-gray-400 text-xs">
                  {new Date(Number(exec.deadline) * 1000).toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  {exec.status === 'pending' ? (
                    <CountdownCell deadline={exec.deadline} />
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <StatusBadge status={exec.status} />
                </td>
                <td className="py-3 px-4">
                  {exec.transactionHash ? (
                    <a
                      href={`${explorerUrl}/tx/${exec.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#A855F7] hover:underline"
                    >
                      {exec.transactionHash.slice(0, 10)}...
                    </a>
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {exec.status === 'pending' && (
                    <SlashButton
                      vaultAddress={vaultAddress}
                      nonce={exec.executionNonce}
                      deadline={exec.deadline}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
