'use client';

import Link from 'next/link';
import { Shield, Search, Star, Zap } from 'lucide-react';
import { useReadContracts } from 'wagmi';
import { useAgentCount } from '@/hooks/useAgent';
import { useRecentTasks } from '@/hooks/useAgentRuntime';
import { useWallet } from '@/hooks/useWallet';
import { useStakeBalance } from '@/hooks/useStaking';
import { CONTRACTS } from '@/lib/contracts';
import { formatBigInt } from '@/lib/utils';
import { TALValidationRegistryABI } from '../../../sdk/src/abi/TALValidationRegistry';

const features = [
  {
    icon: Search,
    title: 'Agent Discovery',
    description:
      'Find verified AI agents with on-chain reputation and capability proofs.',
    href: '/agents',
  },
  {
    icon: Shield,
    title: 'Trustless Verification',
    description:
      'Validate agent outputs through stake-secured re-execution and TEE attestation.',
    href: '/validation',
  },
  {
    icon: Star,
    title: 'On-Chain Reputation',
    description:
      'Transparent, Sybil-resistant reputation built from verified interactions.',
    href: '/agents',
  },
  {
    icon: Zap,
    title: 'Economic Security',
    description:
      'TON staking with slashing ensures agents have skin in the game.',
    href: '/staking',
  },
];

export default function HomePage() {
  const { count: agentCount } = useAgentCount();
  const { tasks } = useRecentTasks();
  const { address, isConnected } = useWallet();
  const { data: stakeBalance } = useStakeBalance(address);

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;

  // Aggregate validation count across first 20 agents
  const agentCountNum = agentCount ? Number(agentCount) : 0;

  const validationContracts = Array.from(
    { length: Math.min(agentCountNum, 20) },
    (_, i) => ({
      address: CONTRACTS.validationRegistry as `0x${string}`,
      abi: TALValidationRegistryABI,
      functionName: 'getAgentValidations' as const,
      args: [BigInt(i + 1)],
    })
  );

  const { data: validationData } = useReadContracts({
    contracts: validationContracts,
    query: { enabled: agentCountNum > 0 },
  });

  const totalValidations = validationData
    ? validationData.reduce((sum, result) => {
        if (result.status === 'success' && Array.isArray(result.result)) {
          return sum + result.result.length;
        }
        return sum;
      }, 0)
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900">
          Tokamak Agent Layer
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-xl text-gray-600">
          The coordination and settlement layer for the autonomous agent
          economy. Discover, verify, and interact with trustless AI agents on
          the Tokamak Network.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/agents" className="btn-primary px-8 py-3 text-base">
            Explore Agents
          </Link>
          <Link
            href="/agents/register"
            className="btn-secondary px-8 py-3 text-base"
          >
            Register Agent
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="card transition-shadow hover:shadow-md"
            >
              <feature.icon className="h-8 w-8 text-tokamak-600" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {feature.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="py-16">
        <div className="card">
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">
            Protocol Statistics
          </h2>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-tokamak-600">
                {agentCount !== undefined ? agentCount.toString() : '-'}
              </p>
              <p className="mt-1 text-sm text-gray-600">Registered Agents</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-tokamak-600">
                {completedTasks > 0 ? completedTasks.toString() : '-'}
              </p>
              <p className="mt-1 text-sm text-gray-600">Tasks Completed</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-tokamak-600">
                {totalValidations > 0 ? totalValidations.toString() : agentCountNum > 0 ? '0' : '-'}
              </p>
              <p className="mt-1 text-sm text-gray-600">Validations</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-tokamak-600">
                {isConnected && stakeBalance ? formatBigInt(stakeBalance, 27) : '-'}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {isConnected ? 'Your TON Staked' : 'TON Staked'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Tasks */}
      {tasks.length > 0 && (
        <section className="pb-16">
          <div className="card">
            <h2 className="mb-6 text-xl font-bold text-gray-900">
              Recent Agent Activity
            </h2>
            <div className="space-y-3">
              {tasks.slice(0, 5).map((task) => (
                <div
                  key={task.taskId}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-2 w-2 rounded-full ${
                        task.status === 'completed'
                          ? 'bg-green-500'
                          : task.status === 'failed'
                            ? 'bg-red-500'
                            : 'bg-yellow-500'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {task.agentId === 'summarizer'
                          ? 'Text Summarization'
                          : task.agentId === 'auditor'
                            ? 'Solidity Audit'
                            : task.agentId}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(task.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        task.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : task.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {task.status}
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      {task.taskId.slice(0, 8)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
