'use client';

import { truncateBytes32 } from '@/lib/utils';
import { useNetwork } from '@/lib/NetworkContext';

interface ExecutionEvent {
  executionNonce: string;
  agentId: string;
  actionCommitment: string;
  actionCount: string;
  transactionHash?: string;
  blockNumber?: string;
  optimisticStatus?: 'proven' | 'pending' | 'finalized' | 'slashed';
}

function ExecutionStatusBadge({ status }: { status?: string }) {
  if (!status || status === 'proven') {
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-white/5 text-gray-400 border-white/10">
        Proven
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

export function ExecutionHistoryTable({ executions }: { executions: ExecutionEvent[] }) {
  const { explorerUrl } = useNetwork();

  if (executions.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500 font-mono text-sm">No executions found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ fontFamily: 'var(--font-mono), monospace' }}>
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Nonce</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Agent ID</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Action Commitment</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Actions</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Status</th>
            <th className="text-left text-gray-500 py-3 px-4 text-xs uppercase tracking-wider">Tx</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((exec, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-3 px-4 text-[#A855F7]">#{exec.executionNonce}</td>
              <td className="py-3 px-4 text-gray-300">{truncateBytes32(exec.agentId)}</td>
              <td className="py-3 px-4 text-gray-400">{truncateBytes32(exec.actionCommitment)}</td>
              <td className="py-3 px-4 text-gray-400">{exec.actionCount}</td>
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
  );
}
