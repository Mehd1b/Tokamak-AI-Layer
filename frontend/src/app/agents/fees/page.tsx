'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Coins, Wallet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useAgentsByOwner } from '@/hooks/useAgent';
import { useReadContracts } from 'wagmi';
import { CONTRACTS, THANOS_CHAIN_ID } from '@/lib/contracts';
import { useL2Config } from '@/hooks/useL2Config';
import { TaskFeeEscrowABI } from '../../../../../sdk/src/abi/TaskFeeEscrow';
import { useClaimFees } from '@/hooks/useTaskFee';
import { formatEther } from 'viem';

function ClaimButton({ agentId, balance }: { agentId: bigint; balance: bigint }) {
  const { claim, isPending, isConfirming, isSuccess, error } = useClaimFees();
  const [claimed, setClaimed] = useState(false);

  const handleClaim = () => {
    claim(agentId);
  };

  if (isSuccess && !claimed) {
    setClaimed(true);
  }

  if (claimed) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
        <CheckCircle className="h-4 w-4" /> Claimed
      </span>
    );
  }

  return (
    <div>
      <button
        onClick={handleClaim}
        disabled={isPending || isConfirming || balance === 0n}
        className="btn-primary inline-flex items-center gap-2 text-sm"
      >
        {isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Confirm...</>
        ) : isConfirming ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Claiming...</>
        ) : (
          <><Coins className="h-4 w-4" /> Claim</>
        )}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-400">{error.message}</p>
      )}
    </div>
  );
}

export default function AgentFeesPage() {
  const { address, isConnected, isCorrectChain: isL2 } = useWallet();
  const { nativeCurrency, name: l2Name } = useL2Config();
  const { agentIds, isLoading: agentsLoading } = useAgentsByOwner(address as `0x${string}` | undefined);

  const ids = agentIds ?? [];
  const hasAgents = ids.length > 0;

  // Batch read: fee balance + per-task fee for each agent (always from OP Sepolia)
  const contracts = ids.flatMap((id) => [
    {
      address: CONTRACTS.taskFeeEscrow,
      abi: TaskFeeEscrowABI,
      functionName: 'getAgentBalance' as const,
      args: [id],
      chainId: THANOS_CHAIN_ID,
    },
    {
      address: CONTRACTS.taskFeeEscrow,
      abi: TaskFeeEscrowABI,
      functionName: 'getAgentFee' as const,
      args: [id],
      chainId: THANOS_CHAIN_ID,
    },
  ]);

  const { data: feeData, isLoading: feesLoading } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: contracts as any,
    query: { enabled: hasAgents },
  });

  const agents = ids.map((id, i) => {
    const balanceResult = feeData?.[i * 2];
    const feeResult = feeData?.[i * 2 + 1];
    const balance = balanceResult?.status === 'success' ? (balanceResult.result as bigint) : 0n;
    const feePerTask = feeResult?.status === 'success' ? (feeResult.result as bigint) : 0n;
    return { id, balance, feePerTask };
  });

  const totalBalance = agents.reduce((sum, a) => sum + a.balance, 0n);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/agents"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Fees</h1>
          <p className="mt-1 text-sm text-zinc-400">
            View and claim accumulated task fees for your agents.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#38BDF8]/20">
          <Wallet className="h-6 w-6 text-[#38BDF8]" />
        </div>
      </div>

      {!isConnected && (
        <div className="card border-amber-500/20 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            Please connect your wallet to view your agent fees.
          </p>
        </div>
      )}

      {isConnected && !isL2 && (
        <div className="card border-amber-500/20 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            Please switch to {l2Name} network.
          </p>
        </div>
      )}

      {isConnected && isL2 && (
        <>
          {/* Total Balance */}
          <div className="card mb-6 border-[#38BDF8]/20 bg-[#38BDF8]/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Total Unclaimed Fees</p>
                <p className="text-3xl font-bold text-[#38BDF8]">
                  {feesLoading ? '...' : `${formatEther(totalBalance)} ${nativeCurrency}`}
                </p>
              </div>
              <Coins className="h-8 w-8 text-[#38BDF8]" />
            </div>
          </div>

          {agentsLoading || feesLoading ? (
            <div className="card text-center py-8">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-600" />
              <p className="mt-2 text-sm text-zinc-500">Loading your agents...</p>
            </div>
          ) : !hasAgents ? (
            <div className="card text-center py-8">
              <p className="text-zinc-500">You don&apos;t own any agents yet.</p>
              <Link href="/agents/register" className="mt-3 inline-block btn-primary text-sm">
                Register an Agent
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {agents.map((agent) => (
                <div key={agent.id.toString()} className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#38BDF8]/20 text-[#38BDF8] font-bold">
                          #{agent.id.toString()}
                        </div>
                        <div>
                          <Link
                            href={`/agents/${agent.id.toString()}`}
                            className="font-medium text-white hover:text-[#38BDF8]"
                          >
                            Agent #{agent.id.toString()}
                          </Link>
                          <p className="text-xs text-zinc-500">
                            Fee: {agent.feePerTask > 0n ? `${formatEther(agent.feePerTask)} ${nativeCurrency}/task` : 'Free (no fee set)'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-[#38BDF8]">
                          {formatEther(agent.balance)} {nativeCurrency}
                        </p>
                        <p className="text-xs text-zinc-500">unclaimed</p>
                      </div>
                      <ClaimButton agentId={agent.id} balance={agent.balance} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
