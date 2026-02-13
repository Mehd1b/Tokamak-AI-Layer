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
  ExternalLink,
} from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { formatEther, formatUnits, parseEther, parseUnits } from 'viem';
import {
  useTONBalance,
  useWTONBalance,
  useWSTONBalance,
  useStakingIndex,
  useTONAllowance,
  useWTONAllowanceForWSTON,
  useApproveTON,
  useSwapToWTON,
  useApproveWTONForWSTON,
  useDepositWTON,
  useRequestWithdrawal,
  useClaimWithdrawal,
  useClaimableAmount,
  useWithdrawalRequestCount,
  toWTONAmount,
} from '@/hooks/useStaking';
import {
  useLockedBalance,
  useVaultTier,
  useL2WSTONBalance,
  useL2WSTONAllowance,
  useApproveL2WSTON,
  useLockWSTON,
  useRequestVaultUnlock,
  useProcessVaultUnlock,
  useVaultWithdrawalRequestCount,
  useVaultReadyAmount,
  tierLabel,
} from '@/hooks/useVault';

export default function StakingPage() {
  const { address, isConnected, isL1, isL2, switchToL1, switchToL2 } = useWallet();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [tokenMode, setTokenMode] = useState<'TON' | 'WTON'>('WTON');
  const [vaultLockAmount, setVaultLockAmount] = useState('');
  const [vaultUnlockAmount, setVaultUnlockAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'l1' | 'l2'>('l1');
  const isWTONMode = tokenMode === 'WTON';

  // --- Read state ---
  const { data: tonBalance } = useTONBalance(address);
  const { data: wtonBalance } = useWTONBalance(address);
  const { data: wstonBalance } = useWSTONBalance(address);
  const { data: stakingIndex } = useStakingIndex();
  const { data: tonAllowance } = useTONAllowance(address);
  const { data: wtonAllowance } = useWTONAllowanceForWSTON(address);
  const { data: claimable } = useClaimableAmount(address);
  const { data: withdrawalCount } = useWithdrawalRequestCount(address);

  // --- Write hooks: Deposit flow ---
  const {
    approve: approveTON,
    isPending: isApprovingTON,
    isConfirming: isApproveTONConfirming,
    isSuccess: isApproveTONSuccess,
  } = useApproveTON();

  const {
    swap: swapToWTON,
    isPending: isSwapping,
    isConfirming: isSwapConfirming,
    isSuccess: isSwapSuccess,
  } = useSwapToWTON();

  const {
    approve: approveWTON,
    isPending: isApprovingWTON,
    isConfirming: isApproveWTONConfirming,
    isSuccess: isApproveWTONSuccess,
  } = useApproveWTONForWSTON();

  const {
    deposit,
    isPending: isDepositing,
    isConfirming: isDepositConfirming,
    isSuccess: isDepositSuccess,
    error: depositError,
  } = useDepositWTON();

  // --- Write hooks: Withdrawal flow ---
  const {
    requestWithdrawal,
    isPending: isRequestingWithdrawal,
    isConfirming: isWithdrawalConfirming,
    isSuccess: isWithdrawalSuccess,
    error: withdrawalError,
  } = useRequestWithdrawal();

  const {
    claim,
    isPending: isClaiming,
    isConfirming: isClaimConfirming,
    isSuccess: isClaimSuccess,
  } = useClaimWithdrawal();

  // --- L2 Vault hooks ---
  const { data: lockedBalance } = useLockedBalance(address);
  const { data: vaultTier } = useVaultTier(address);
  const { data: l2WstonBalance } = useL2WSTONBalance(address);
  const { data: l2WstonAllowance } = useL2WSTONAllowance(address);
  const { data: vaultPendingCount } = useVaultWithdrawalRequestCount(address);
  const { data: vaultReadyAmount } = useVaultReadyAmount(address);

  const {
    approve: approveL2WSTON,
    isPending: isApprovingL2WSTON,
    isConfirming: isApproveL2WSTONConfirming,
    isSuccess: isApproveL2WSTONSuccess,
  } = useApproveL2WSTON();

  const {
    lock: lockWSTON,
    isPending: isLocking,
    isConfirming: isLockConfirming,
    isSuccess: isLockSuccess,
    error: lockError,
  } = useLockWSTON();

  const {
    requestUnlock: vaultRequestUnlock,
    isPending: isVaultUnlocking,
    isConfirming: isVaultUnlockConfirming,
    isSuccess: isVaultUnlockSuccess,
    error: vaultUnlockError,
  } = useRequestVaultUnlock();

  const {
    processUnlock,
    isPending: isProcessing,
    isConfirming: isProcessConfirming,
    isSuccess: isProcessSuccess,
  } = useProcessVaultUnlock();

  // --- Formatting helpers ---
  const formatBalance = (value: bigint | undefined, decimals = 18) => {
    if (value === undefined) return '-';
    const formatted = formatUnits(value, decimals);
    const num = parseFloat(formatted);
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const formatWTON = (value: bigint | undefined) => formatBalance(value, 27);

  const formatIndex = (value: bigint | undefined) => {
    if (value === undefined) return '-';
    const formatted = formatUnits(value, 27);
    const num = parseFloat(formatted);
    return num.toFixed(6);
  };

  // --- Deposit flow logic ---
  // In WTON mode: user enters amount in WTON (27 decimals)
  // In TON mode: user enters amount in TON (18 decimals), which gets swapped to WTON first
  const rawAmount = depositAmount && parseFloat(depositAmount) > 0 ? depositAmount : '';
  const wtonDepositAmount = rawAmount
    ? (isWTONMode ? parseUnits(rawAmount, 27) : toWTONAmount(parseEther(rawAmount)))
    : 0n;

  // Estimate WSTON output: wtonAmount / stakingIndex (both 27 decimals)
  const estimatedWSTON = wtonDepositAmount > 0n && stakingIndex && stakingIndex > 0n
    ? (wtonDepositAmount * 10n ** 27n) / stakingIndex
    : 0n;

  // Step detection for deposit
  const needsTONApproval =
    !isWTONMode &&
    wtonDepositAmount > 0n &&
    tonAllowance !== undefined &&
    !isApproveTONSuccess &&
    tonAllowance < parseEther(rawAmount || '0');

  const needsSwap =
    !isWTONMode &&
    wtonDepositAmount > 0n &&
    !needsTONApproval &&
    !isSwapSuccess;

  const needsWTONApproval =
    wtonDepositAmount > 0n &&
    !needsTONApproval &&
    !needsSwap &&
    wtonAllowance !== undefined &&
    !isApproveWTONSuccess &&
    wtonAllowance < wtonDepositAmount;

  const readyToDeposit = wtonDepositAmount > 0n && !needsTONApproval && !needsSwap && !needsWTONApproval;

  const currentStep = isWTONMode
    ? (needsWTONApproval ? 1 : 2)
    : (needsTONApproval ? 1 : needsSwap ? 2 : needsWTONApproval ? 3 : 4);
  const totalSteps = isWTONMode ? 2 : 4;

  const handleDeposit = () => {
    if (!rawAmount) return;
    if (needsTONApproval) approveTON(rawAmount);
    else if (needsSwap) swapToWTON(rawAmount);
    else if (needsWTONApproval) approveWTON(wtonDepositAmount);
    else deposit(wtonDepositAmount);
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (!withdrawAmount || isNaN(amount) || amount <= 0) return;
    // WSTON has 27 decimals (same as WTON)
    const wstonAmount = parseUnits(withdrawAmount, 27);
    requestWithdrawal(wstonAmount);
  };

  const isAnyDepositPending =
    isApprovingTON || isApproveTONConfirming ||
    isSwapping || isSwapConfirming ||
    isApprovingWTON || isApproveWTONConfirming ||
    isDepositing || isDepositConfirming;

  const getDepositButtonText = () => {
    if (isApprovingTON || isApproveTONConfirming) return 'Approving TON...';
    if (isSwapping || isSwapConfirming) return 'Swapping to WTON...';
    if (isApprovingWTON || isApproveWTONConfirming) return 'Approving WTON...';
    if (isDepositing || isDepositConfirming) return 'Depositing...';
    if (isWTONMode) {
      if (needsWTONApproval) return 'Step 1/2: Approve WTON';
      return 'Step 2/2: Deposit';
    }
    if (needsTONApproval) return 'Step 1/4: Approve TON';
    if (needsSwap) return 'Step 2/4: Swap TON \u2192 WTON';
    if (needsWTONApproval) return 'Step 3/4: Approve WTON';
    return `Step 4/4: Deposit`;
  };

  // --- L2 Vault handlers ---
  const vaultLockBigInt = vaultLockAmount && parseFloat(vaultLockAmount) > 0
    ? parseEther(vaultLockAmount)
    : 0n;

  const needsL2Approval =
    vaultLockBigInt > 0n &&
    l2WstonAllowance !== undefined &&
    !isApproveL2WSTONSuccess &&
    l2WstonAllowance < vaultLockBigInt;

  const handleVaultLock = () => {
    if (vaultLockBigInt === 0n) return;
    if (needsL2Approval) {
      approveL2WSTON(vaultLockBigInt);
    } else {
      lockWSTON(vaultLockBigInt);
    }
  };

  const handleVaultUnlock = () => {
    if (!vaultUnlockAmount || parseFloat(vaultUnlockAmount) <= 0) return;
    vaultRequestUnlock(parseEther(vaultUnlockAmount));
  };

  const isAnyVaultLockPending = isApprovingL2WSTON || isApproveL2WSTONConfirming || isLocking || isLockConfirming;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">WSTON Staking</h1>
        <p className="mt-2 text-zinc-400">
          Wrap your TON/WTON into WSTON on L1 Sepolia, then bridge to L2 and lock
          in the vault to secure agent validations.
        </p>
      </div>

      {/* L1 / L2 Tab Toggle */}
      <div className="mb-6 flex items-center rounded-lg border border-white/10 bg-white/5 p-1 w-fit">
        <button
          onClick={() => setActiveTab('l1')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'l1'
              ? 'bg-white/10 text-[#38BDF8] shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          L1 Wrapping
        </button>
        <button
          onClick={() => setActiveTab('l2')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'l2'
              ? 'bg-white/10 text-[#38BDF8] shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          L2 Vault
        </button>
      </div>

      {!isConnected && (
        <div className="card mb-6 border-amber-500/20 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            Please connect your wallet to view staking information and participate.
          </p>
        </div>
      )}

      {activeTab === 'l1' && isConnected && !isL1 && (
        <div className="card mb-6 border-amber-500/20 bg-amber-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <p className="text-sm text-amber-400">
                WSTON wrapping operates on L1 Sepolia. Please switch networks.
              </p>
            </div>
            <button
              onClick={switchToL1}
              className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              Switch to L1 Sepolia
            </button>
          </div>
        </div>
      )}

      {activeTab === 'l2' && isConnected && !isL2 && (
        <div className="card mb-6 border-amber-500/20 bg-amber-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <p className="text-sm text-amber-400">
                L2 Vault operates on Thanos Sepolia (L2). Please switch networks.
              </p>
            </div>
            <button
              onClick={switchToL2}
              className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              Switch to L2
            </button>
          </div>
        </div>
      )}

      {/* ======================== L1 TAB ======================== */}
      {activeTab === 'l1' && <>
      {/* Stats Bar */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="card text-center">
          <Coins className="mx-auto h-8 w-8 text-[#38BDF8]" />
          <p className="mt-2 text-2xl font-bold text-white">
            {formatBalance(tonBalance)}
          </p>
          <p className="text-sm text-zinc-500">TON Balance</p>
        </div>
        <div className="card text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-green-500" />
          <p className="mt-2 text-2xl font-bold text-white">
            {formatWTON(wtonBalance)}
          </p>
          <p className="text-sm text-zinc-500">WTON Balance</p>
        </div>
        <div className="card text-center">
          <Shield className="mx-auto h-8 w-8 text-purple-500" />
          <p className="mt-2 text-2xl font-bold text-white">
            {formatWTON(wstonBalance)}
          </p>
          <p className="text-sm text-zinc-500">WSTON Balance</p>
        </div>
        <div className="card text-center">
          <Lock className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-2 text-2xl font-bold text-white">
            {formatIndex(stakingIndex)}
          </p>
          <p className="text-sm text-zinc-500">Staking Index</p>
        </div>
      </div>

      {/* Deposit & Withdrawal Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Deposit Card */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-semibold text-white">
                Deposit {tokenMode} \u2192 WSTON
              </h2>
            </div>
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
              <button
                onClick={() => { setTokenMode('WTON'); setDepositAmount(''); }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  tokenMode === 'WTON'
                    ? 'bg-white/10 text-[#38BDF8] shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                WTON
              </button>
              <button
                onClick={() => { setTokenMode('TON'); setDepositAmount(''); }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  tokenMode === 'TON'
                    ? 'bg-white/10 text-[#38BDF8] shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                TON
              </button>
            </div>
          </div>
          <p className="mb-4 text-sm text-zinc-400">
            {isWTONMode
              ? 'Deposit WTON directly into the WSTON contract (2 steps: approve + deposit).'
              : 'Deposit TON \u2192 automatically swapped to WTON \u2192 deposited as WSTON (4 steps).'}
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Amount (in {tokenMode})
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  disabled={!isConnected || !isL1}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50 disabled:bg-white/[0.02] disabled:text-zinc-600"
                />
                <button
                  onClick={() => {
                    if (isWTONMode && wtonBalance !== undefined) {
                      setDepositAmount(formatUnits(wtonBalance, 27));
                    } else if (!isWTONMode && tonBalance !== undefined) {
                      setDepositAmount(formatEther(tonBalance));
                    }
                  }}
                  disabled={!isConnected || !isL1}
                  className="rounded-lg bg-white/10 px-3 text-xs font-medium text-zinc-300 hover:bg-white/20 disabled:opacity-50"
                >
                  MAX
                </button>
                <span className="flex items-center rounded-lg bg-white/10 px-3 text-sm font-medium text-zinc-300">
                  {tokenMode}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Available: {isWTONMode
                  ? `${formatWTON(wtonBalance)} WTON`
                  : `${formatBalance(tonBalance)} TON`}
              </p>
            </div>

            {/* WSTON estimate */}
            {rawAmount && estimatedWSTON > 0n && (
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs text-zinc-400">
                  Estimated WSTON received:{' '}
                  <span className="font-semibold text-white">
                    {formatWTON(estimatedWSTON)}
                  </span>
                </p>
              </div>
            )}

            {/* Step progress */}
            {rawAmount && (
              <div className="space-y-1 rounded-lg bg-white/5 p-3">
                <p className="text-xs font-medium text-zinc-400">Deposit steps ({totalSteps} total):</p>
                {isWTONMode ? (
                  <>
                    <StepLine label="1. Approve WTON" done={currentStep > 1 || isApproveWTONSuccess} active={currentStep === 1} />
                    <StepLine label="2. Deposit" done={isDepositSuccess} active={currentStep === 2 && !isDepositSuccess} />
                  </>
                ) : (
                  <>
                    <StepLine label="1. Approve TON" done={currentStep > 1 || isApproveTONSuccess} active={currentStep === 1} />
                    <StepLine label="2. Swap TON \u2192 WTON" done={currentStep > 2 || isSwapSuccess} active={currentStep === 2} />
                    <StepLine label="3. Approve WTON" done={currentStep > 3 || isApproveWTONSuccess} active={currentStep === 3} />
                    <StepLine label="4. Deposit" done={isDepositSuccess} active={currentStep === 4 && !isDepositSuccess} />
                  </>
                )}
              </div>
            )}

            {isDepositSuccess && (
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle className="h-3 w-3" />
                Deposit successful! WSTON has been minted to your wallet.
              </div>
            )}
            {depositError && (
              <p className="text-xs text-red-400">
                {depositError.message.substring(0, 120)}
              </p>
            )}
            <button
              onClick={handleDeposit}
              disabled={
                !isConnected ||
                !isL1 ||
                !rawAmount ||
                isAnyDepositPending
              }
              className="btn-primary w-full"
            >
              {isAnyDepositPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {getDepositButtonText()}
                </span>
              ) : (
                getDepositButtonText()
              )}
            </button>
          </div>
        </div>

        {/* Withdrawal Card */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <ArrowDownRight className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-white">
              Withdraw WSTON
            </h2>
          </div>
          <p className="mb-4 text-sm text-zinc-400">
            Request withdrawal of WSTON to receive WTON back. Minimum 100 WSTON.
            Withdrawals have a processing delay.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Amount (in WSTON)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.0"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  disabled={!isConnected || !isL1}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50 disabled:bg-white/[0.02] disabled:text-zinc-600"
                />
                <button
                  onClick={() => {
                    if (wstonBalance !== undefined) {
                      setWithdrawAmount(formatUnits(wstonBalance, 27));
                    }
                  }}
                  disabled={!isConnected || !isL1}
                  className="rounded-lg bg-white/10 px-3 text-xs font-medium text-zinc-300 hover:bg-white/20 disabled:opacity-50"
                >
                  MAX
                </button>
                <span className="flex items-center rounded-lg bg-white/10 px-3 text-sm font-medium text-zinc-300">
                  WSTON
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Available: {formatWTON(wstonBalance)} WSTON
              </p>
            </div>

            {withdrawAmount && parseFloat(withdrawAmount) > 0 && parseFloat(withdrawAmount) < 100 && (
              <div className="flex items-center gap-1 text-xs text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Minimum withdrawal is 100 WSTON
              </div>
            )}

            <div className="rounded-lg bg-white/5 p-3 text-xs text-zinc-400">
              <p>Withdrawal requests are subject to a processing delay. After requesting,
              use &quot;Claim&quot; once the withdrawal is ready.</p>
            </div>

            {isWithdrawalSuccess && (
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle className="h-3 w-3" />
                Withdrawal requested! You can claim once processing completes.
              </div>
            )}
            {withdrawalError && (
              <p className="text-xs text-red-400">
                {withdrawalError.message.substring(0, 120)}
              </p>
            )}
            <button
              onClick={handleWithdraw}
              disabled={
                !isConnected ||
                !isL1 ||
                !withdrawAmount ||
                parseFloat(withdrawAmount) < 100 ||
                isRequestingWithdrawal ||
                isWithdrawalConfirming
              }
              className="btn-secondary w-full"
            >
              {isRequestingWithdrawal || isWithdrawalConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Requesting...
                </span>
              ) : (
                'Request Withdrawal'
              )}
            </button>

            {/* Claimable section */}
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-300">Claimable WTON</p>
                  <p className="text-lg font-bold text-white">{formatWTON(claimable)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-zinc-300">Pending Requests</p>
                  <p className="text-lg font-bold text-white">
                    {withdrawalCount !== undefined ? withdrawalCount.toString() : '-'}
                  </p>
                </div>
              </div>
              {isClaimSuccess && (
                <div className="mb-2 flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle className="h-3 w-3" />
                  Claim successful!
                </div>
              )}
              <button
                onClick={claim}
                disabled={
                  !isConnected ||
                  !isL1 ||
                  !claimable ||
                  claimable === 0n ||
                  isClaiming ||
                  isClaimConfirming
                }
                className="btn-primary w-full"
              >
                {isClaiming || isClaimConfirming ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Claiming...
                  </span>
                ) : (
                  'Claim WTON'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bridge Info Card */}
      <div className="mt-8 card border-[#38BDF8]/20 bg-[#38BDF8]/5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#38BDF8]" />
          <div>
            <h3 className="font-semibold text-white">
              Bridge WSTON to L2
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              After wrapping your TON/WTON into WSTON, bridge your WSTON tokens
              to Thanos Sepolia (L2) using the Tokamak Bridge Portal. Once on L2,
              you can lock WSTON in the vault to participate in agent validation
              and earn rewards.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs font-medium text-zinc-500">
                  Step 1
                </p>
                <p className="text-sm font-bold text-white">Wrap to WSTON</p>
                <p className="text-xs text-zinc-500">On L1 Sepolia (this page)</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs font-medium text-zinc-500">
                  Step 2
                </p>
                <p className="text-sm font-bold text-white">Bridge to L2</p>
                <p className="text-xs text-zinc-500">Via Tokamak Bridge Portal</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs font-medium text-zinc-500">
                  Step 3
                </p>
                <p className="text-sm font-bold text-white">Lock in Vault</p>
                <p className="text-xs text-zinc-500">On L2 (switch to L2 below)</p>
              </div>
            </div>
            <a
              href="https://bridge.tokamak.network"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#38BDF8] hover:underline"
            >
              Open Tokamak Bridge Portal <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
      </>}

      {/* ======================== L2 TAB ======================== */}
      {activeTab === 'l2' && <>
      {/* Vault Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="card text-center">
          <Lock className="mx-auto h-8 w-8 text-purple-500" />
          <p className="mt-2 text-2xl font-bold text-white">
            {formatBalance(lockedBalance)}
          </p>
          <p className="text-sm text-zinc-500">Locked WSTON</p>
        </div>
        <div className="card text-center">
          <Shield className="mx-auto h-8 w-8 text-[#38BDF8]" />
          <p className="mt-2 text-2xl font-bold text-white">
            {vaultTier !== undefined ? tierLabel(vaultTier) : '-'}
          </p>
          <p className="text-sm text-zinc-500">Operator Tier</p>
        </div>
        <div className="card text-center">
          <Coins className="mx-auto h-8 w-8 text-green-500" />
          <p className="mt-2 text-2xl font-bold text-white">
            {formatBalance(l2WstonBalance)}
          </p>
          <p className="text-sm text-zinc-500">L2 WSTON Balance</p>
        </div>
        <div className="card text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-2 text-2xl font-bold text-white">
            {vaultPendingCount !== undefined ? vaultPendingCount.toString() : '-'}
          </p>
          <p className="text-sm text-zinc-500">Pending Unlocks</p>
        </div>
      </div>

      {/* Vault Lock / Unlock */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Lock Card */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-white">Lock WSTON</h2>
          </div>
          <p className="mb-4 text-sm text-zinc-400">
            Lock bridged WSTON in the vault to participate in agent validation.
            Higher locks = higher tier = more validation opportunities.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Amount (WSTON)</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.0"
                  value={vaultLockAmount}
                  onChange={(e) => setVaultLockAmount(e.target.value)}
                  disabled={!isConnected || !isL2}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50 disabled:bg-white/[0.02] disabled:text-zinc-600"
                />
                <button
                  onClick={() => {
                    if (l2WstonBalance !== undefined) {
                      setVaultLockAmount(formatEther(l2WstonBalance));
                    }
                  }}
                  disabled={!isConnected || !isL2}
                  className="rounded-lg bg-white/10 px-3 text-xs font-medium text-zinc-300 hover:bg-white/20 disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Available: {formatBalance(l2WstonBalance)} WSTON
              </p>
            </div>

            {/* Lock step indicator */}
            {vaultLockBigInt > 0n && (
              <div className="space-y-1 rounded-lg bg-white/5 p-3">
                <StepLine label="1. Approve WSTON" done={!needsL2Approval || isApproveL2WSTONSuccess} active={needsL2Approval && !isApproveL2WSTONSuccess} />
                <StepLine label="2. Lock in Vault" done={isLockSuccess} active={!needsL2Approval && !isLockSuccess} />
              </div>
            )}

            {isLockSuccess && (
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle className="h-3 w-3" />
                WSTON locked successfully!
              </div>
            )}
            {lockError && (
              <p className="text-xs text-red-400">
                {lockError.message.substring(0, 120)}
              </p>
            )}
            <button
              onClick={handleVaultLock}
              disabled={!isConnected || !isL2 || vaultLockBigInt === 0n || isAnyVaultLockPending}
              className="btn-primary w-full"
            >
              {isAnyVaultLockPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isApprovingL2WSTON || isApproveL2WSTONConfirming ? 'Approving...' : 'Locking...'}
                </span>
              ) : needsL2Approval ? (
                'Step 1/2: Approve WSTON'
              ) : (
                'Step 2/2: Lock'
              )}
            </button>
          </div>
        </div>

        {/* Unlock Card */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <ArrowDownRight className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-white">Unlock WSTON</h2>
          </div>
          <p className="mb-4 text-sm text-zinc-400">
            Request to unlock WSTON from the vault. Subject to a withdrawal delay
            for network security.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Amount (WSTON)</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.0"
                  value={vaultUnlockAmount}
                  onChange={(e) => setVaultUnlockAmount(e.target.value)}
                  disabled={!isConnected || !isL2}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50 disabled:bg-white/[0.02] disabled:text-zinc-600"
                />
                <button
                  onClick={() => {
                    if (lockedBalance !== undefined) {
                      setVaultUnlockAmount(formatEther(lockedBalance));
                    }
                  }}
                  disabled={!isConnected || !isL2}
                  className="rounded-lg bg-white/10 px-3 text-xs font-medium text-zinc-300 hover:bg-white/20 disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Locked: {formatBalance(lockedBalance)} WSTON
              </p>
            </div>

            {isVaultUnlockSuccess && (
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle className="h-3 w-3" />
                Unlock requested! Wait for the delay period, then claim.
              </div>
            )}
            {vaultUnlockError && (
              <p className="text-xs text-red-400">
                {vaultUnlockError.message.substring(0, 120)}
              </p>
            )}
            <button
              onClick={handleVaultUnlock}
              disabled={
                !isConnected ||
                !isL2 ||
                !vaultUnlockAmount ||
                parseFloat(vaultUnlockAmount) <= 0 ||
                isVaultUnlocking ||
                isVaultUnlockConfirming
              }
              className="btn-secondary w-full"
            >
              {isVaultUnlocking || isVaultUnlockConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Requesting...
                </span>
              ) : (
                'Request Unlock'
              )}
            </button>

            {/* Process unlock section */}
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-300">Ready to Claim</p>
                  <p className="text-lg font-bold text-white">{formatBalance(vaultReadyAmount)} WSTON</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-zinc-300">Pending</p>
                  <p className="text-lg font-bold text-white">
                    {vaultPendingCount !== undefined ? vaultPendingCount.toString() : '-'}
                  </p>
                </div>
              </div>
              {isProcessSuccess && (
                <div className="mb-2 flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle className="h-3 w-3" />
                  Unlock processed!
                </div>
              )}
              <button
                onClick={processUnlock}
                disabled={
                  !isConnected ||
                  !isL2 ||
                  !vaultReadyAmount ||
                  vaultReadyAmount === 0n ||
                  isProcessing ||
                  isProcessConfirming
                }
                className="btn-primary w-full"
              >
                {isProcessing || isProcessConfirming ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                  </span>
                ) : (
                  'Claim Unlocked WSTON'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tier Info */}
      <div className="mt-8 card border-purple-500/20 bg-purple-500/5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-400" />
          <div>
            <h3 className="font-semibold text-white">Operator Tiers</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Your locked WSTON determines your operator tier, which affects
              your eligibility for validation tasks and bounty distribution.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs font-medium text-zinc-500">Unverified</p>
                <p className="text-sm font-bold text-white">&lt; 1,000 WSTON</p>
                <p className="text-xs text-zinc-500">Cannot validate</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs font-medium text-[#38BDF8]">Verified</p>
                <p className="text-sm font-bold text-white">&ge; 1,000 WSTON</p>
                <p className="text-xs text-zinc-500">Standard validation</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs font-medium text-purple-400">Premium</p>
                <p className="text-sm font-bold text-white">&ge; 10,000 WSTON</p>
                <p className="text-xs text-zinc-500">Priority validation</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

// ============ Step indicator component ============

function StepLine({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span
        className={
          done
            ? 'text-emerald-400'
            : active
              ? 'font-semibold text-[#38BDF8]'
              : 'text-zinc-600'
        }
      >
        {label}
      </span>
      {done && <CheckCircle className="h-3 w-3 text-emerald-400" />}
    </div>
  );
}
