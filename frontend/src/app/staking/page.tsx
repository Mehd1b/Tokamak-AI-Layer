'use client';

import {
  Coins,
  TrendingUp,
  Shield,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';

export default function StakingPage() {
  const { isConnected, isCorrectChain } = useWallet();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Staking</h1>
        <p className="mt-2 text-gray-600">
          Stake TON to secure agent validations, earn seigniorage rewards, and
          participate in the TAL trust network.
        </p>
      </div>

      {!isConnected && (
        <div className="card mb-6 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Please connect your wallet to view staking information and
            participate.
          </p>
        </div>
      )}

      {isConnected && !isCorrectChain && (
        <div className="card mb-6 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Please switch to Optimism Sepolia network.
          </p>
        </div>
      )}

      {/* Overview Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="card text-center">
          <Coins className="mx-auto h-8 w-8 text-tokamak-500" />
          <p className="mt-2 text-2xl font-bold text-gray-900">-</p>
          <p className="text-sm text-gray-500">Total Staked</p>
        </div>
        <div className="card text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-green-500" />
          <p className="mt-2 text-2xl font-bold text-gray-900">-</p>
          <p className="text-sm text-gray-500">APY</p>
        </div>
        <div className="card text-center">
          <Shield className="mx-auto h-8 w-8 text-blue-500" />
          <p className="mt-2 text-2xl font-bold text-gray-900">-</p>
          <p className="text-sm text-gray-500">Active Validators</p>
        </div>
        <div className="card text-center">
          <Lock className="mx-auto h-8 w-8 text-purple-500" />
          <p className="mt-2 text-2xl font-bold text-gray-900">-</p>
          <p className="text-sm text-gray-500">Your Stake</p>
        </div>
      </div>

      {/* Staking Actions */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Stake */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900">Stake TON</h2>
          </div>
          <p className="mb-4 text-sm text-gray-600">
            Stake TON tokens to secure the validation network. Your stake weight
            determines your influence on reputation scores and validator
            selection.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Amount
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  placeholder="0.0"
                  disabled={!isConnected || !isCorrectChain}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500 disabled:bg-gray-100"
                />
                <span className="flex items-center rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-700">
                  TON
                </span>
              </div>
            </div>
            <button
              disabled={!isConnected || !isCorrectChain}
              className="btn-primary w-full"
            >
              Stake
            </button>
          </div>
        </div>

        {/* Unstake */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <ArrowDownRight className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Unstake TON
            </h2>
          </div>
          <p className="mb-4 text-sm text-gray-600">
            Withdraw your staked TON. Unstaking has a cooldown period to
            maintain network security. Slashed stakes cannot be withdrawn.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Amount
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  placeholder="0.0"
                  disabled={!isConnected || !isCorrectChain}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500 disabled:bg-gray-100"
                />
                <span className="flex items-center rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-700">
                  TON
                </span>
              </div>
            </div>
            <button
              disabled={!isConnected || !isCorrectChain}
              className="btn-secondary w-full"
            >
              Unstake
            </button>
          </div>
        </div>
      </div>

      {/* Cross-Layer Bridge Info */}
      <div className="mt-8 card">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-tokamak-500" />
          <div>
            <h3 className="font-semibold text-gray-900">
              Cross-Layer Staking Bridge
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              TAL supports cross-layer staking via the L1↔L2 bridge. Stakes on
              L1 are mirrored to L2 through Merkle proof verification, enabling
              L1 TON stakers to participate in L2 agent validation without
              moving funds. Seigniorage rewards are distributed proportionally
              based on stake weight.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">
                  Minimum Stake
                </p>
                <p className="text-sm font-bold text-gray-900">
                  100 TON
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">
                  Cooldown Period
                </p>
                <p className="text-sm font-bold text-gray-900">7 days</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">
                  Slashing Penalty
                </p>
                <p className="text-sm font-bold text-gray-900">
                  Up to 10%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
