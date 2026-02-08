'use client';

import { useState } from 'react';
import {
  Coins,
  TrendingUp,
  Shield,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { formatEther } from 'viem';
import {
  useTONBalance,
  useStakeBalance,
  useTONAllowance,
  useApproveTON,
  useStakeTON,
  useUnstakeTON,
} from '@/hooks/useStaking';

export default function StakingPage() {
  const { address, isConnected, isL1, switchToL1 } = useWallet();
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');

  const { data: tonBalance } = useTONBalance(address);
  const { data: stakedBalance } = useStakeBalance(address);
  const { data: allowance } = useTONAllowance(address);

  const {
    approve,
    isPending: isApproving,
    isConfirming: isApproveConfirming,
    isSuccess: isApproveSuccess,
  } = useApproveTON();

  const {
    stake,
    isPending: isStaking,
    isConfirming: isStakeConfirming,
    isSuccess: isStakeSuccess,
    error: stakeError,
  } = useStakeTON();

  const {
    unstake,
    isPending: isUnstaking,
    isConfirming: isUnstakeConfirming,
    isSuccess: isUnstakeSuccess,
    error: unstakeError,
  } = useUnstakeTON();

  const formatBalance = (value: bigint | undefined) => {
    if (value === undefined) return '-';
    const formatted = formatEther(value);
    const num = parseFloat(formatted);
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const needsApproval =
    stakeAmount &&
    allowance !== undefined &&
    tonBalance !== undefined &&
    parseFloat(stakeAmount) > 0 &&
    allowance < BigInt(Math.floor(parseFloat(stakeAmount) * 1e18));

  const handleStake = () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) return;
    if (needsApproval) {
      approve(stakeAmount);
    } else {
      stake(stakeAmount);
    }
  };

  const handleUnstake = () => {
    if (!unstakeAmount || parseFloat(unstakeAmount) <= 0) return;
    unstake(unstakeAmount);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Staking</h1>
        <p className="mt-2 text-gray-600">
          Stake TON on L1 Sepolia to secure agent validations, earn seigniorage
          rewards, and participate in the TAL trust network.
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

      {isConnected && !isL1 && (
        <div className="card mb-6 border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-800">
                Staking operates on L1 Sepolia. Please switch networks.
              </p>
            </div>
            <button
              onClick={switchToL1}
              className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
              Switch to L1 Sepolia
            </button>
          </div>
        </div>
      )}

      {/* Overview Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="card text-center">
          <Coins className="mx-auto h-8 w-8 text-tokamak-500" />
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatBalance(tonBalance)}
          </p>
          <p className="text-sm text-gray-500">TON Balance</p>
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
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatBalance(stakedBalance)}
          </p>
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
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  disabled={!isConnected || !isL1}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500 disabled:bg-gray-100"
                />
                <span className="flex items-center rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-700">
                  TON
                </span>
              </div>
              {tonBalance !== undefined && (
                <p className="mt-1 text-xs text-gray-500">
                  Available: {formatBalance(tonBalance)} TON
                </p>
              )}
            </div>
            {isApproveSuccess && !isStakeSuccess && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                Approved! Now click Stake to deposit.
              </div>
            )}
            {isStakeSuccess && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                Staked successfully!
              </div>
            )}
            {stakeError && (
              <p className="text-xs text-red-600">
                {stakeError.message.substring(0, 100)}
              </p>
            )}
            <button
              onClick={handleStake}
              disabled={
                !isConnected ||
                !isL1 ||
                !stakeAmount ||
                parseFloat(stakeAmount) <= 0 ||
                isApproving ||
                isApproveConfirming ||
                isStaking ||
                isStakeConfirming
              }
              className="btn-primary w-full"
            >
              {isApproving || isApproveConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Approving...
                </span>
              ) : isStaking || isStakeConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Staking...
                </span>
              ) : needsApproval ? (
                'Approve TON'
              ) : (
                'Stake'
              )}
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
                  value={unstakeAmount}
                  onChange={(e) => setUnstakeAmount(e.target.value)}
                  disabled={!isConnected || !isL1}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500 disabled:bg-gray-100"
                />
                <span className="flex items-center rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-700">
                  TON
                </span>
              </div>
              {stakedBalance !== undefined && (
                <p className="mt-1 text-xs text-gray-500">
                  Staked: {formatBalance(stakedBalance)} TON
                </p>
              )}
            </div>
            {isUnstakeSuccess && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                Withdrawal requested! Cooldown period applies.
              </div>
            )}
            {unstakeError && (
              <p className="text-xs text-red-600">
                {unstakeError.message.substring(0, 100)}
              </p>
            )}
            <button
              onClick={handleUnstake}
              disabled={
                !isConnected ||
                !isL1 ||
                !unstakeAmount ||
                parseFloat(unstakeAmount) <= 0 ||
                isUnstaking ||
                isUnstakeConfirming
              }
              className="btn-secondary w-full"
            >
              {isUnstaking || isUnstakeConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                </span>
              ) : (
                'Unstake'
              )}
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
              TAL supports cross-layer staking via the L1-L2 bridge. Stakes on
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
                <p className="text-sm font-bold text-gray-900">100 TON</p>
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
                <p className="text-sm font-bold text-gray-900">Up to 10%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
