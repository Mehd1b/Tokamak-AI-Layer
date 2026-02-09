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
import { formatEther, formatUnits, parseEther } from 'viem';
import {
  useTONBalance,
  useWTONBalance,
  useStakeBalance,
  useTONAllowance,
  useWTONAllowance,
  useApproveTON,
  useSwapToWTON,
  useApproveWTON,
  useStakeTON,
  useUnstakeTON,
  toWTONAmount,
} from '@/hooks/useStaking';

export default function StakingPage() {
  const { address, isConnected, isL1, switchToL1 } = useWallet();
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [tokenMode, setTokenMode] = useState<'TON' | 'WTON'>('TON');
  const isWTONMode = tokenMode === 'WTON';

  const { data: tonBalance } = useTONBalance(address);
  const { data: wtonBalance } = useWTONBalance(address);
  const { data: stakedBalance } = useStakeBalance(address);
  const { data: tonAllowance } = useTONAllowance(address);
  const { data: wtonAllowance } = useWTONAllowance(address);

  // Step 1: Approve TON → WTON contract
  const {
    approve: approveTON,
    isPending: isApprovingTON,
    isConfirming: isApproveTONConfirming,
    isSuccess: isApproveTONSuccess,
  } = useApproveTON();

  // Step 2: Swap TON → WTON
  const {
    swap: swapToWTON,
    isPending: isSwapping,
    isConfirming: isSwapConfirming,
    isSuccess: isSwapSuccess,
  } = useSwapToWTON();

  // Step 3: Approve WTON → DepositManager
  const {
    approve: approveWTON,
    isPending: isApprovingWTON,
    isConfirming: isApproveWTONConfirming,
    isSuccess: isApproveWTONSuccess,
  } = useApproveWTON();

  // Step 4: Deposit
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

  const formatWTONBalance = (value: bigint | undefined) => {
    if (value === undefined) return '-';
    const formatted = formatUnits(value, 27);
    const num = parseFloat(formatted);
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  // Multi-step staking flow detection
  const tonAmount = stakeAmount && parseFloat(stakeAmount) > 0 ? parseEther(stakeAmount) : 0n;
  const wtonAmount = tonAmount > 0n ? toWTONAmount(tonAmount) : 0n;

  // In WTON mode, skip TON approval and swap steps
  const needsTONApproval =
    !isWTONMode &&
    tonAmount > 0n &&
    tonAllowance !== undefined &&
    !isApproveTONSuccess &&
    tonAllowance < tonAmount;

  const needsSwap =
    !isWTONMode &&
    tonAmount > 0n &&
    !needsTONApproval &&
    wtonBalance !== undefined &&
    !isSwapSuccess &&
    wtonBalance < wtonAmount;

  const needsWTONApproval =
    wtonAmount > 0n &&
    !needsTONApproval &&
    !needsSwap &&
    wtonAllowance !== undefined &&
    !isApproveWTONSuccess &&
    wtonAllowance < wtonAmount;

  const readyToStake = tonAmount > 0n && !needsTONApproval && !needsSwap && !needsWTONApproval;

  // WTON mode: 2 steps (approve WTON + deposit), TON mode: 4 steps
  const currentStep = isWTONMode
    ? (needsWTONApproval ? 1 : 2)
    : (needsTONApproval ? 1 : needsSwap ? 2 : needsWTONApproval ? 3 : 4);
  const totalSteps = isWTONMode ? 2 : 4;

  const handleStake = () => {
    const amount = parseFloat(stakeAmount);
    if (!stakeAmount || isNaN(amount) || amount <= 0) return;
    if (needsTONApproval) approveTON(stakeAmount);
    else if (needsSwap) swapToWTON(stakeAmount);
    else if (needsWTONApproval) approveWTON(stakeAmount);
    else stake(stakeAmount);
  };

  const handleUnstake = () => {
    const amount = parseFloat(unstakeAmount);
    if (!unstakeAmount || isNaN(amount) || amount <= 0) return;
    unstake(unstakeAmount);
  };

  const isAnyPending =
    isApprovingTON || isApproveTONConfirming ||
    isSwapping || isSwapConfirming ||
    isApprovingWTON || isApproveWTONConfirming ||
    isStaking || isStakeConfirming;

  const getButtonText = () => {
    if (isApprovingTON || isApproveTONConfirming) return 'Approving TON...';
    if (isSwapping || isSwapConfirming) return 'Swapping to WTON...';
    if (isApprovingWTON || isApproveWTONConfirming) return 'Approving WTON...';
    if (isStaking || isStakeConfirming) return 'Staking...';
    if (isWTONMode) {
      if (needsWTONApproval) return 'Step 1/2: Approve WTON';
      return 'Step 2/2: Stake';
    }
    if (needsTONApproval) return 'Step 1/4: Approve TON';
    if (needsSwap) return 'Step 2/4: Swap TON → WTON';
    if (needsWTONApproval) return 'Step 3/4: Approve WTON';
    return 'Step 4/4: Stake';
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
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatWTONBalance(wtonBalance)}
          </p>
          <p className="text-sm text-gray-500">WTON Balance</p>
        </div>
        <div className="card text-center">
          <Shield className="mx-auto h-8 w-8 text-blue-500" />
          <p className="mt-2 text-2xl font-bold text-gray-900">-</p>
          <p className="text-sm text-gray-500">Active Validators</p>
        </div>
        <div className="card text-center">
          <Lock className="mx-auto h-8 w-8 text-purple-500" />
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatWTONBalance(stakedBalance)}
          </p>
          <p className="text-sm text-gray-500">Your Stake</p>
        </div>
      </div>

      {/* Staking Actions */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Stake */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Stake {tokenMode}
              </h2>
            </div>
            {/* TON / WTON toggle */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => { setTokenMode('TON'); setStakeAmount(''); }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  tokenMode === 'TON'
                    ? 'bg-white text-tokamak-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                TON
              </button>
              <button
                onClick={() => { setTokenMode('WTON'); setStakeAmount(''); }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  tokenMode === 'WTON'
                    ? 'bg-white text-tokamak-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                WTON
              </button>
            </div>
          </div>
          <p className="mb-4 text-sm text-gray-600">
            {isWTONMode
              ? 'Stake WTON directly to the DepositManager (2 steps: approve + deposit).'
              : 'Stake TON tokens to secure the validation network. TON is automatically wrapped to WTON before depositing (4 steps).'}
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Amount (in {tokenMode})
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.0"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  disabled={!isConnected || !isL1}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500 disabled:bg-gray-100"
                />
                <span className="flex items-center rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-700">
                  {tokenMode}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Available: {isWTONMode
                  ? `${formatWTONBalance(wtonBalance)} WTON`
                  : `${formatBalance(tonBalance)} TON`}
              </p>
            </div>

            {/* Step progress */}
            {stakeAmount && parseFloat(stakeAmount) > 0 && (
              <div className="space-y-1 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600">Staking steps ({totalSteps} total):</p>
                {isWTONMode ? (
                  <>
                    <div className="flex items-center gap-1 text-xs">
                      <span className={currentStep > 1 || isApproveWTONSuccess ? 'text-green-600' : currentStep === 1 ? 'font-semibold text-tokamak-600' : 'text-gray-400'}>
                        1. Approve WTON
                      </span>
                      {(currentStep > 1 || isApproveWTONSuccess) && <CheckCircle className="h-3 w-3 text-green-500" />}
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className={isStakeSuccess ? 'text-green-600' : currentStep === 2 ? 'font-semibold text-tokamak-600' : 'text-gray-400'}>
                        2. Deposit
                      </span>
                      {isStakeSuccess && <CheckCircle className="h-3 w-3 text-green-500" />}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1 text-xs">
                      <span className={currentStep > 1 || isApproveTONSuccess ? 'text-green-600' : currentStep === 1 ? 'font-semibold text-tokamak-600' : 'text-gray-400'}>
                        1. Approve TON
                      </span>
                      {(currentStep > 1 || isApproveTONSuccess) && <CheckCircle className="h-3 w-3 text-green-500" />}
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className={currentStep > 2 || isSwapSuccess ? 'text-green-600' : currentStep === 2 ? 'font-semibold text-tokamak-600' : 'text-gray-400'}>
                        2. Swap TON → WTON
                      </span>
                      {(currentStep > 2 || isSwapSuccess) && <CheckCircle className="h-3 w-3 text-green-500" />}
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className={currentStep > 3 || isApproveWTONSuccess ? 'text-green-600' : currentStep === 3 ? 'font-semibold text-tokamak-600' : 'text-gray-400'}>
                        3. Approve WTON
                      </span>
                      {(currentStep > 3 || isApproveWTONSuccess) && <CheckCircle className="h-3 w-3 text-green-500" />}
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className={isStakeSuccess ? 'text-green-600' : currentStep === 4 ? 'font-semibold text-tokamak-600' : 'text-gray-400'}>
                        4. Deposit
                      </span>
                      {isStakeSuccess && <CheckCircle className="h-3 w-3 text-green-500" />}
                    </div>
                  </>
                )}
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
                isAnyPending
              }
              className="btn-primary w-full"
            >
              {isAnyPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {getButtonText()}
                </span>
              ) : (
                getButtonText()
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
                Amount (in TON)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
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
                  Staked: {formatWTONBalance(stakedBalance)} TON
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
