'use client';

import { useState } from 'react';
import { useNetwork } from '@/lib/NetworkContext';
import type { ActionInfo } from '@/hooks/useVaultExecutions';

const PAGE_SIZE = 10;

interface ExecutionEvent {
  executionNonce: string;
  actionCommitment: string;
  actionCount: string;
  actions: ActionInfo[];
  transactionHash?: string;
  blockNumber?: string;
  timestamp?: number;
  optimisticStatus?: 'pending' | 'finalized' | 'slashed';
}

function ExecutionStatusBadge({ status }: { status?: string }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-400 border-green-500/20">
        Finalized
      </span>
    );
  }

  const styles: Record<string, string> = {
    pending: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    finalized: 'bg-green-500/10 text-green-400 border-green-500/20',
    slashed: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const labels: Record<string, string> = {
    pending: 'Pending Proof',
    finalized: 'Finalized',
    slashed: 'Slashed',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status] ?? ''}`}>
      {labels[status] ?? status}
    </span>
  );
}

const ACTION_LABEL_STYLES: Record<string, string> = {
  'Open Position': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Close Position': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Deposit Margin': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Deposit Balance': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Withdraw to Vault': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Fund HYPE Gas': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'Register Vault': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Perp to Spot': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Spot to EVM': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'ERC20 Transfer': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'ERC20 Approve': 'bg-white/5 text-gray-400 border-white/10',
  'Rescue Tokens': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'No-Op': 'bg-white/5 text-gray-500 border-white/10',
};

function ActionBadge({ label }: { label: string }) {
  const style = ACTION_LABEL_STYLES[label] ?? 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}>
      {label}
    </span>
  );
}

function ActionsSummary({ actions, actionCount }: { actions: ActionInfo[]; actionCount: string }) {
  if (actions.length === 0) {
    const count = parseInt(actionCount, 10) || 0;
    if (count === 0) return <span className="text-gray-600">-</span>;
    return <span className="text-gray-400 text-xs">{count} action{count !== 1 ? 's' : ''}</span>;
  }

  if (actions.length <= 3) {
    return (
      <div className="flex flex-wrap gap-1">
        {actions.map((a, i) => (
          <ActionBadge key={i} label={a.label} />
        ))}
      </div>
    );
  }

  // Summarize when many actions
  const counts = new Map<string, number>();
  for (const a of actions) {
    counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
  }
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from(counts.entries()).map(([label, count]) => (
        <span
          key={label}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${ACTION_LABEL_STYLES[label] ?? 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}
        >
          {count}x {label}
        </span>
      ))}
    </div>
  );
}

export function ExecutionHistoryTable({ executions }: { executions: ExecutionEvent[] }) {
  const { explorerUrl } = useNetwork();
  const [page, setPage] = useState(0);

  if (executions.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500 font-mono text-sm">No executions found</p>
      </div>
    );
  }

  const totalPages = Math.ceil(executions.length / PAGE_SIZE);
  const pageExecutions = executions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Nonce</th>
              <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Actions</th>
              <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Date</th>
              <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Status</th>
              <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Tx</th>
            </tr>
          </thead>
          <tbody>
            {pageExecutions.map((exec, i) => (
              <tr key={exec.executionNonce + '-' + i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="py-3 px-4 text-[#A855F7]">#{exec.executionNonce}</td>
                <td className="py-3 px-4">
                  <ActionsSummary actions={exec.actions} actionCount={exec.actionCount} />
                </td>
                <td className="py-3 px-4 text-gray-400">
                  {exec.timestamp
                    ? new Date(exec.timestamp * 1000).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })
                    : '-'}
                </td>
                <td className="py-3 px-4">
                  <ExecutionStatusBadge status={exec.optimisticStatus} />
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 px-4 border-t border-white/5">
          <span className="text-xs text-gray-500 font-mono">
            {executions.length} execution{executions.length !== 1 ? 's' : ''} total
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded text-xs font-mono border border-white/10 text-gray-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="text-xs text-gray-500 font-mono">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded text-xs font-mono border border-white/10 text-gray-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
