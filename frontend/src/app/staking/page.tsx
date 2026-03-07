'use client';

import { useState } from 'react';
import {
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  TokenIcon,
  ChartIcon,
  ShieldIcon,
  LockIcon,
  IndexIcon,
  CoinsIcon,
  DepositIcon,
  WithdrawIcon,
  SearchIcon as SearchSvg,
  BondLockIcon,
} from '@/components/icons/StakingIcons';
import { useWallet } from '@/hooks/useWallet';
import { formatUnits, parseEther, parseUnits, isAddress, type Address } from 'viem';
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
  useWSTONBalanceForBond,
  useWSTONAllowanceForBond,
  useTotalBonded,
  useMinBondFloor,
  useBondInfo,
  useApproveWSTONForBond,
  useLockBond,
  bondStatusLabel,
} from '@/hooks/useBondManager';

export default function StakingPage() {
  const { address, isConnected, isL1, switchToL1 } = useWallet();
  const [activeTab, setActiveTab] = useState<'l1' | 'bonds'>('l1');

  // --- L1 Wrapping state ---
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [tokenMode, setTokenMode] = useState<'TON' | 'WTON'>('WTON');
  const isWTONMode = tokenMode === 'WTON';

  // --- Bond Management state ---
  const [bondVault, setBondVault] = useState('');
  const [bondNonce, setBondNonce] = useState('');
  const [bondAmount, setBondAmount] = useState('');
  const [lookupVault, setLookupVault] = useState('');
  const [lookupNonce, setLookupNonce] = useState('');
  const [lookupActive, setLookupActive] = useState(false);

  // --- L1 read state ---
  const { data: tonBalance } = useTONBalance(address);
  const { data: wtonBalance } = useWTONBalance(address);
  const { data: wstonBalance } = useWSTONBalance(address);
  const { data: stakingIndex } = useStakingIndex();
  const { data: tonAllowance } = useTONAllowance(address);
  const { data: wtonAllowance } = useWTONAllowanceForWSTON(address);
  const { data: claimable } = useClaimableAmount(address);
  const { data: withdrawalCount } = useWithdrawalRequestCount(address);

  // --- L1 write hooks: Deposit flow ---
  const { approve: approveTON, isPending: isApprovingTON, isConfirming: isApproveTONConfirming, isSuccess: isApproveTONSuccess } = useApproveTON();
  const { swap: swapToWTON, isPending: isSwapping, isConfirming: isSwapConfirming, isSuccess: isSwapSuccess } = useSwapToWTON();
  const { approve: approveWTON, isPending: isApprovingWTON, isConfirming: isApproveWTONConfirming, isSuccess: isApproveWTONSuccess } = useApproveWTONForWSTON();
  const { deposit, isPending: isDepositing, isConfirming: isDepositConfirming, isSuccess: isDepositSuccess, error: depositError } = useDepositWTON();

  // --- L1 write hooks: Withdrawal flow ---
  const { requestWithdrawal, isPending: isRequestingWithdrawal, isConfirming: isWithdrawalConfirming, isSuccess: isWithdrawalSuccess, error: withdrawalError } = useRequestWithdrawal();
  const { claim, isPending: isClaiming, isConfirming: isClaimConfirming, isSuccess: isClaimSuccess } = useClaimWithdrawal();

  // --- Bond Management hooks ---
  const { data: wstonBondBalance } = useWSTONBalanceForBond(address);
  const { data: wstonBondAllowance } = useWSTONAllowanceForBond(address);
  const { data: totalBonded } = useTotalBonded(address);
  const { data: minBondFloor } = useMinBondFloor();

  const { approve: approveWSTONBond, isPending: isApprovingBond, isConfirming: isApproveBondConfirming, isSuccess: isApproveBondSuccess } = useApproveWSTONForBond();
  const { lockBond, isPending: isLocking, isConfirming: isLockConfirming, isSuccess: isLockSuccess, error: lockError } = useLockBond();

  // Bond lookup
  const lookupVaultAddr = lookupActive && isAddress(lookupVault) ? lookupVault as Address : undefined;
  const lookupNonceBigInt = lookupActive && lookupNonce && !isNaN(Number(lookupNonce)) ? BigInt(lookupNonce) : undefined;
  const { data: bondInfo } = useBondInfo(address, lookupVaultAddr, lookupNonceBigInt);

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
    return parseFloat(formatUnits(value, 27)).toFixed(6);
  };

  // --- Deposit flow logic ---
  const rawAmount = depositAmount && parseFloat(depositAmount) > 0 ? depositAmount : '';
  const wtonDepositAmount = rawAmount
    ? (isWTONMode ? parseUnits(rawAmount, 27) : toWTONAmount(parseEther(rawAmount)))
    : 0n;

  const estimatedWSTON = wtonDepositAmount > 0n && stakingIndex && stakingIndex > 0n
    ? (wtonDepositAmount * 10n ** 27n) / stakingIndex : 0n;

  const needsTONApproval = !isWTONMode && wtonDepositAmount > 0n && tonAllowance !== undefined && !isApproveTONSuccess && tonAllowance < parseEther(rawAmount || '0');
  const needsSwap = !isWTONMode && wtonDepositAmount > 0n && !needsTONApproval && !isSwapSuccess;
  const needsWTONApproval = wtonDepositAmount > 0n && !needsTONApproval && !needsSwap && wtonAllowance !== undefined && !isApproveWTONSuccess && wtonAllowance < wtonDepositAmount;

  const currentStep = isWTONMode ? (needsWTONApproval ? 1 : 2) : (needsTONApproval ? 1 : needsSwap ? 2 : needsWTONApproval ? 3 : 4);
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
    requestWithdrawal(parseUnits(withdrawAmount, 27));
  };

  const isAnyDepositPending = isApprovingTON || isApproveTONConfirming || isSwapping || isSwapConfirming || isApprovingWTON || isApproveWTONConfirming || isDepositing || isDepositConfirming;

  const getDepositButtonText = () => {
    if (isApprovingTON || isApproveTONConfirming) return 'Approving TON...';
    if (isSwapping || isSwapConfirming) return 'Swapping to WTON...';
    if (isApprovingWTON || isApproveWTONConfirming) return 'Approving WTON...';
    if (isDepositing || isDepositConfirming) return 'Depositing...';
    if (isWTONMode) return needsWTONApproval ? 'Step 1/2: Approve WTON' : 'Step 2/2: Deposit';
    if (needsTONApproval) return 'Step 1/4: Approve TON';
    if (needsSwap) return 'Step 2/4: Swap TON \u2192 WTON';
    if (needsWTONApproval) return 'Step 3/4: Approve WTON';
    return 'Step 4/4: Deposit';
  };

  // --- Bond lock logic ---
  const bondAmountBigInt = bondAmount && parseFloat(bondAmount) > 0 ? parseUnits(bondAmount, 27) : 0n;
  const needsBondApproval = bondAmountBigInt > 0n && wstonBondAllowance !== undefined && !isApproveBondSuccess && wstonBondAllowance < bondAmountBigInt;
  const isAnyBondPending = isApprovingBond || isApproveBondConfirming || isLocking || isLockConfirming;

  const handleLockBond = () => {
    if (bondAmountBigInt === 0n || !isAddress(bondVault) || !bondNonce || isNaN(Number(bondNonce))) return;
    if (needsBondApproval) {
      approveWSTONBond(bondAmountBigInt);
    } else {
      lockBond(bondVault as Address, BigInt(bondNonce), bondAmountBigInt);
    }
  };

  return (
    <div className="relative mx-auto max-w-7xl px-6 pt-28 pb-16 lg:px-12" style={{ fontFamily: 'var(--font-mono), monospace' }}>
      {/* Ambient background blob */}
      <div
        className="pointer-events-none fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] opacity-[0.06]"
        style={{
          background: 'radial-gradient(circle, #A855F7 0%, #7C3AED 40%, transparent 70%)',
          animation: 'morph-blob 20s ease-in-out infinite',
          borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
        }}
      />

      {/* Header */}
      <div className="relative mb-10 animate-[slide-in-left_0.6s_ease-out]">
        <span
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-6"
        >
          <span className="w-2 h-2 rounded-full bg-[#A855F7] animate-pulse mr-2" />
          Economic Security
        </span>
        <h1
          className="text-4xl md:text-5xl font-light mb-4"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="text-white">WSTON </span>
          <span className="italic shimmer-text">Staking &amp; Bonds</span>
        </h1>
        <p className="text-gray-400 max-w-2xl leading-relaxed">
          Wrap your TON/WTON into WSTON on Ethereum, then lock bonds to secure optimistic executions.
        </p>
      </div>

      <div className="w-full h-px mb-8" style={{ background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.3), transparent)' }} />

      {/* Tab Toggle */}
      <div className="mb-8 flex items-center rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-1 w-fit animate-[slide-in-left_0.6s_ease-out_0.1s_both]">
        {(['l1', 'bonds'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
              activeTab === tab
                ? 'bg-[#A855F7]/15 text-[#C084FC] border border-[#A855F7]/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            {tab === 'l1' ? 'L1 Wrapping' : 'Bond Management'}
          </button>
        ))}
      </div>

      {!isConnected && (
        <div className="card mb-6 border-[#A855F7]/20 bg-[#A855F7]/5">
          <p className="text-sm text-[#C084FC]">
            Please connect your wallet to view staking information and participate.
          </p>
        </div>
      )}

      {isConnected && !isL1 && (
        <NetworkWarning message="All operations require Ethereum Mainnet. Please switch networks." onSwitch={switchToL1} label="Switch to Ethereum" />
      )}

      {/* ======================== L1 WRAPPING TAB ======================== */}
      {activeTab === 'l1' && <>
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
          <StatCard icon={<TokenIcon className="mx-auto h-8 w-8" />} value={formatBalance(tonBalance)} label="TON Balance" delay={0} />
          <StatCard icon={<ChartIcon className="mx-auto h-8 w-8" />} value={formatWTON(wtonBalance)} label="WTON Balance" delay={1} />
          <StatCard icon={<ShieldIcon className="mx-auto h-8 w-8" />} value={formatWTON(wstonBalance)} label="WSTON Balance" delay={2} />
          <StatCard icon={<IndexIcon className="mx-auto h-8 w-8" />} value={formatIndex(stakingIndex)} label="Staking Index" delay={3} />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Deposit Card */}
          <div className="card animate-[slide-in-left_0.5s_ease-out_0.3s_both]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DepositIcon className="h-5 w-5" />
                <h2 className="text-lg font-medium text-white">Deposit {tokenMode} &rarr; WSTON</h2>
              </div>
              <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
                {(['WTON', 'TON'] as const).map((mode) => (
                  <button key={mode} onClick={() => { setTokenMode(mode); setDepositAmount(''); }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-all duration-300 ${tokenMode === mode ? 'bg-[#A855F7]/15 text-[#C084FC] shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-4 text-sm text-white/40">
              {isWTONMode
                ? 'Deposit WTON directly into the WSTON contract (2 steps: approve + deposit).'
                : 'Deposit TON \u2192 automatically swapped to WTON \u2192 deposited as WSTON (4 steps).'}
            </p>
            <div className="space-y-4">
              <AmountInput
                value={depositAmount} onChange={setDepositAmount}
                disabled={!isConnected || !isL1} suffix={tokenMode}
                onMax={() => {
                  if (isWTONMode && wtonBalance !== undefined) setDepositAmount(formatUnits(wtonBalance, 27));
                  else if (!isWTONMode && tonBalance !== undefined) setDepositAmount(formatUnits(tonBalance, 18));
                }}
                available={isWTONMode ? `${formatWTON(wtonBalance)} WTON` : `${formatBalance(tonBalance)} TON`}
              />
              {rawAmount && estimatedWSTON > 0n && (
                <div className="rounded-lg bg-[#A855F7]/5 border border-[#A855F7]/10 p-3">
                  <p className="text-xs text-white/40">Estimated WSTON received: <span className="font-semibold text-[#C084FC]">{formatWTON(estimatedWSTON)}</span></p>
                </div>
              )}
              {rawAmount && (
                <div className="space-y-1 rounded-lg bg-white/5 border border-white/10 p-3">
                  <p className="text-xs font-medium text-white/40">Deposit steps ({totalSteps} total):</p>
                  {isWTONMode ? (<>
                    <StepLine label="1. Approve WTON" done={currentStep > 1 || isApproveWTONSuccess} active={currentStep === 1} />
                    <StepLine label="2. Deposit" done={isDepositSuccess} active={currentStep === 2 && !isDepositSuccess} />
                  </>) : (<>
                    <StepLine label="1. Approve TON" done={currentStep > 1 || isApproveTONSuccess} active={currentStep === 1} />
                    <StepLine label="2. Swap TON &rarr; WTON" done={currentStep > 2 || isSwapSuccess} active={currentStep === 2} />
                    <StepLine label="3. Approve WTON" done={currentStep > 3 || isApproveWTONSuccess} active={currentStep === 3} />
                    <StepLine label="4. Deposit" done={isDepositSuccess} active={currentStep === 4 && !isDepositSuccess} />
                  </>)}
                </div>
              )}
              {isDepositSuccess && <SuccessMsg text="Deposit successful! WSTON has been minted to your wallet." />}
              {depositError && <ErrorMsg text={depositError.message} />}
              <button onClick={handleDeposit} disabled={!isConnected || !isL1 || !rawAmount || isAnyDepositPending} className="btn-primary w-full">
                {isAnyDepositPending ? <SpinnerBtn text={getDepositButtonText()} /> : getDepositButtonText()}
              </button>
            </div>
          </div>

          {/* Withdrawal Card */}
          <div className="card animate-[slide-in-right_0.5s_ease-out_0.3s_both]">
            <div className="mb-4 flex items-center gap-2">
              <WithdrawIcon className="h-5 w-5" />
              <h2 className="text-lg font-medium text-white">Withdraw WSTON</h2>
            </div>
            <p className="mb-4 text-sm text-white/40">
              Request withdrawal of WSTON to receive WTON back. Minimum 100 WSTON. Withdrawals have a processing delay.
            </p>
            <div className="space-y-4">
              <AmountInput
                value={withdrawAmount} onChange={setWithdrawAmount}
                disabled={!isConnected || !isL1} suffix="WSTON"
                onMax={() => { if (wstonBalance !== undefined) setWithdrawAmount(formatUnits(wstonBalance, 27)); }}
                available={`${formatWTON(wstonBalance)} WSTON`}
              />
              {withdrawAmount && parseFloat(withdrawAmount) > 0 && parseFloat(withdrawAmount) < 100 && (
                <div className="flex items-center gap-1 text-xs text-[#C084FC]"><AlertTriangle className="h-3 w-3" />Minimum withdrawal is 100 WSTON</div>
              )}
              {isWithdrawalSuccess && <SuccessMsg text="Withdrawal requested! You can claim once processing completes." />}
              {withdrawalError && <ErrorMsg text={withdrawalError.message} />}
              <button onClick={handleWithdraw}
                disabled={!isConnected || !isL1 || !withdrawAmount || parseFloat(withdrawAmount) < 100 || isRequestingWithdrawal || isWithdrawalConfirming}
                className="btn-secondary w-full">
                {isRequestingWithdrawal || isWithdrawalConfirming ? <SpinnerBtn text="Requesting..." /> : 'Request Withdrawal'}
              </button>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/60">Claimable WTON</p>
                    <p className="text-lg font-bold text-white">{formatWTON(claimable)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white/60">Pending Requests</p>
                    <p className="text-lg font-bold text-white">{withdrawalCount !== undefined ? withdrawalCount.toString() : '-'}</p>
                  </div>
                </div>
                {isClaimSuccess && <SuccessMsg text="Claim successful!" />}
                <button onClick={claim}
                  disabled={!isConnected || !isL1 || !claimable || claimable === 0n || isClaiming || isClaimConfirming}
                  className="btn-primary w-full">
                  {isClaiming || isClaimConfirming ? <SpinnerBtn text="Claiming..." /> : 'Claim WTON'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>}

      {/* ======================== BOND MANAGEMENT TAB ======================== */}
      {activeTab === 'bonds' && <>
        {/* Info banner */}
        <div className="mb-8 card border-[#A855F7]/20 bg-[#A855F7]/5 animate-[slide-in-left_0.5s_ease-out]">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#C084FC]" />
            <div>
              <h3 className="font-medium text-white">Cross-Chain Oracle-Attested Bonds</h3>
              <p className="mt-1 text-sm text-white/40">
                Lock WSTON on Ethereum as collateral for optimistic executions. The oracle attests your bond,
                allowing the vault to execute actions immediately. Bonds are released when proof is submitted,
                or slashed if the challenge window expires.
              </p>
              <div className="mt-3 rounded-lg bg-[#7C3AED]/5 border border-[#7C3AED]/20 p-3">
                <p className="text-sm text-[#C084FC] font-medium">Bond Requirement</p>
                <p className="mt-1 text-sm text-white/40">
                  Each optimistic execution requires a bond of <b className="text-white">100 TON</b> (in WSTON equivalent).
                  If a vault allows up to N concurrent pending executions, the operator must have at least
                  <b className="text-white"> N &times; 100 TON</b> staked. For example, a vault with 5 concurrent
                  executions requires <b className="text-white">500 TON</b> worth of WSTON locked as bonds.
                </p>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-white/30">
                <p className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED] flex-shrink-0" />
                  <b className="text-white/50">Lock:</b> Approve WSTON &rarr; lockBond(vault, nonce, amount) on L1
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C084FC] flex-shrink-0" />
                  <b className="text-white/50">Attest:</b> Oracle signs attestation after seeing L1 event
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#A855F7] flex-shrink-0" />
                  <b className="text-white/50">Execute:</b> Submit attestation to HyperEVM vault for optimistic execution
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D946EF] flex-shrink-0" />
                  <b className="text-white/50">Resolve:</b> Bond released on proof, slashed if expired
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatCard icon={<ShieldIcon className="mx-auto h-8 w-8" />} value={formatWTON(wstonBondBalance)} label="WSTON Balance" delay={0} />
          <StatCard icon={<LockIcon className="mx-auto h-8 w-8" />} value={formatWTON(totalBonded)} label="Total Bonded" delay={1} />
          <StatCard icon={<CoinsIcon className="mx-auto h-8 w-8" />} value={formatWTON(minBondFloor)} label="Min Bond Floor" delay={2} />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Lock Bond Card */}
          <div className="card animate-[slide-in-left_0.5s_ease-out_0.3s_both]">
            <div className="mb-4 flex items-center gap-2">
              <BondLockIcon className="h-5 w-5" />
              <h2 className="text-lg font-medium text-white">Lock Bond</h2>
            </div>
            <p className="mb-4 text-sm text-white/40">
              Lock WSTON as collateral for a specific vault and execution nonce.
              The oracle will attest your bond.
            </p>
            <div className="space-y-4">
              {/* Vault address */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Vault Address</label>
                <input
                  type="text" placeholder="0x..." value={bondVault}
                  onChange={(e) => setBondVault(e.target.value)}
                  disabled={!isConnected || !isL1}
                  className="input-dark"
                                 />
                {bondVault && !isAddress(bondVault) && (
                  <p className="mt-1 text-xs text-red-400">Invalid address</p>
                )}
              </div>

              {/* Nonce */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Execution Nonce</label>
                <input
                  type="number" min="0" step="1" placeholder="0" value={bondNonce}
                  onChange={(e) => setBondNonce(e.target.value)}
                  disabled={!isConnected || !isL1}
                  className="input-dark"
                />
              </div>

              {/* Amount */}
              <AmountInput
                value={bondAmount} onChange={setBondAmount}
                disabled={!isConnected || !isL1} suffix="WSTON"
                onMax={() => { if (wstonBondBalance !== undefined) setBondAmount(formatUnits(wstonBondBalance, 27)); }}
                available={`${formatWTON(wstonBondBalance)} WSTON`}
              />

              {/* Min bond warning */}
              {bondAmountBigInt > 0n && minBondFloor !== undefined && bondAmountBigInt < minBondFloor && (
                <div className="flex items-center gap-1 text-xs text-[#C084FC]">
                  <AlertTriangle className="h-3 w-3" />
                  Minimum bond is {formatWTON(minBondFloor)} WSTON
                </div>
              )}

              {/* Step indicators */}
              {bondAmountBigInt > 0n && isAddress(bondVault) && bondNonce && (
                <div className="space-y-1 rounded-lg bg-white/5 border border-white/10 p-3">
                  <p className="text-xs font-medium text-white/40">Lock steps:</p>
                  <StepLine label="1. Approve WSTON for BondManager" done={!needsBondApproval || isApproveBondSuccess} active={needsBondApproval && !isApproveBondSuccess} />
                  <StepLine label="2. Lock Bond" done={isLockSuccess} active={!needsBondApproval && !isLockSuccess} />
                </div>
              )}

              {isLockSuccess && <SuccessMsg text="Bond locked! Wait for oracle attestation, then submit to HyperEVM vault." />}
              {lockError && <ErrorMsg text={lockError.message} />}

              <button
                onClick={handleLockBond}
                disabled={
                  !isConnected || !isL1 || bondAmountBigInt === 0n ||
                  !isAddress(bondVault) || !bondNonce || isNaN(Number(bondNonce)) ||
                  isAnyBondPending
                }
                className="btn-primary w-full"
              >
                {isAnyBondPending
                  ? <SpinnerBtn text={isApprovingBond || isApproveBondConfirming ? 'Approving...' : 'Locking...'} />
                  : needsBondApproval ? 'Step 1/2: Approve WSTON' : 'Step 2/2: Lock Bond'}
              </button>
            </div>
          </div>

          {/* Bond Lookup Card */}
          <div className="card animate-[slide-in-right_0.5s_ease-out_0.3s_both]">
            <div className="mb-4 flex items-center gap-2">
              <SearchSvg className="h-5 w-5" />
              <h2 className="text-lg font-medium text-white">Bond Lookup</h2>
            </div>
            <p className="mb-4 text-sm text-white/40">
              Query the status of a specific bond by vault address and execution nonce.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Vault Address</label>
                <input
                  type="text" placeholder="0x..." value={lookupVault}
                  onChange={(e) => { setLookupVault(e.target.value); setLookupActive(false); }}
                  disabled={!isConnected || !isL1}
                  className="input-dark"
                                 />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Execution Nonce</label>
                <input
                  type="number" min="0" step="1" placeholder="0" value={lookupNonce}
                  onChange={(e) => { setLookupNonce(e.target.value); setLookupActive(false); }}
                  disabled={!isConnected || !isL1}
                  className="input-dark"
                />
              </div>
              <button
                onClick={() => setLookupActive(true)}
                disabled={!isConnected || !isL1 || !isAddress(lookupVault) || !lookupNonce || isNaN(Number(lookupNonce))}
                className="btn-secondary w-full"
              >
                Query Bond
              </button>

              {/* Results */}
              {lookupActive && bondInfo && (
                <div className="rounded-xl border border-white/10 bg-[#1a1a24]/50 p-4 space-y-3 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/30">Status</p>
                    <BondStatusBadge status={Number(bondInfo[2])} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/30">Amount</p>
                    <p className="text-sm font-bold text-white">{formatWTON(bondInfo[0])} WSTON</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/30">Locked At</p>
                    <p className="text-sm text-white">
                      {bondInfo[1] > 0n
                        ? new Date(Number(bondInfo[1]) * 1000).toLocaleString()
                        : '-'}
                    </p>
                  </div>
                </div>
              )}
              {lookupActive && bondInfo && bondInfo[2] === 0 && (
                <p className="text-xs text-white/30 text-center">No bond found for this vault/nonce combination.</p>
              )}
            </div>
          </div>
        </div>

        {/* Slash Distribution Info */}
        <div className="mt-8 card border-[#7C3AED]/20 bg-[#7C3AED]/5 animate-[slide-in-left_0.5s_ease-out_0.5s_both]">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#C084FC]" />
            <div>
              <h3 className="font-medium text-white">Slash Distribution</h3>
              <p className="mt-1 text-sm text-white/40">
                When a bond is slashed (proof not submitted within challenge window), the WSTON is distributed:
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <SlashCard label="Finder Fee" pct="10%" description="Reward for triggering the slash" color="text-[#A855F7]" />
                <SlashCard label="Vault Depositors" pct="80%" description="Returned to vault as compensation" color="text-[#C084FC]" />
                <SlashCard label="Treasury" pct="10%" description="Protocol treasury" color="text-[#D946EF]" />
              </div>
              <p className="mt-3 text-xs text-white/30">
                Self-slashes (operator triggers their own slash): 0% finder, 90% depositors, 10% treasury.
              </p>
            </div>
          </div>
        </div>
      </>}
    </div>
  );
}

// ============ Reusable sub-components ============

function StepLine({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs transition-all duration-200">
      {done ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="#A855F7" strokeWidth="1.5" fill="#A855F7" fillOpacity="0.15" />
          <path d="M4.5 7 L6.2 8.7 L9.5 5.3" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : active ? (
        <div className="h-3.5 w-3.5 rounded-full border-2 border-[#A855F7] bg-[#A855F7]/20" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border border-white/20" />
      )}
      <span className={done ? 'text-[#C084FC]' : active ? 'font-semibold text-[#C084FC]' : 'text-zinc-600'}>{label}</span>
    </div>
  );
}

function StatCard({ icon, value, label, delay = 0 }: { icon: React.ReactNode; value: string; label: string; delay?: number }) {
  return (
    <div
      className="card text-center group hover:border-[#A855F7]/30 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)] cursor-default"
      style={{ animationDelay: `${delay * 100}ms`, animation: `slide-in-left 0.5s ease-out ${delay * 100}ms both` }}
    >
      <div className="transition-transform duration-300 group-hover:scale-110">{icon}</div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-white/30">{label}</p>
    </div>
  );
}

function AmountInput({ value, onChange, disabled, suffix, onMax, available }: {
  value: string; onChange: (v: string) => void; disabled: boolean; suffix: string;
  onMax: () => void; available: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/60 mb-1">Amount (in {suffix})</label>
      <div className="flex gap-2">
        <input type="number" min="0" step="0.01" placeholder="0.0" value={value}
          onChange={(e) => onChange(e.target.value)} disabled={disabled}
          className="input-dark flex-1"
                 />
        <button onClick={onMax} disabled={disabled}
          className="rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-zinc-300 hover:bg-[#A855F7]/10 hover:border-[#A855F7]/30 hover:text-[#C084FC] disabled:opacity-50 transition-all duration-300">
          MAX
        </button>
        <span
          className="flex items-center rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium text-zinc-300"
        >{suffix}</span>
      </div>
      <p className="mt-1 text-xs text-white/30">
        Available: {available}
      </p>
    </div>
  );
}

function NetworkWarning({ message, onSwitch, label }: { message: string; onSwitch: () => void; label: string }) {
  return (
    <div className="card mb-6 border-[#A855F7]/20 bg-[#A855F7]/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#C084FC]" />
          <p className="text-sm text-[#C084FC]">{message}</p>
        </div>
        <button onClick={onSwitch} className="btn-primary text-xs">{label}</button>
      </div>
    </div>
  );
}

function SuccessMsg({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-[#C084FC] animate-[slide-in-left_0.3s_ease-out]">
      <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#A855F7" strokeWidth="1.5" fill="#A855F7" fillOpacity="0.15" />
        <path d="M4.5 7 L6.2 8.7 L9.5 5.3" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text}
    </div>
  );
}

function ErrorMsg({ text }: { text: string }) {
  return <p className="text-xs text-red-400">{text.substring(0, 120)}</p>;
}

function SpinnerBtn({ text }: { text: string }) {
  return <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{text}</span>;
}

const BOND_STATUS_CONFIG: Record<number, { className: string; label: string }> = {
  0: { className: 'badge bg-zinc-500/10 text-zinc-400 border border-zinc-500/20', label: 'Empty' },
  1: { className: 'badge-warning', label: 'Locked' },
  2: { className: 'badge-success', label: 'Released' },
  3: { className: 'badge-error', label: 'Slashed' },
};

function BondStatusBadge({ status }: { status: number }) {
  const config = BOND_STATUS_CONFIG[status] ?? BOND_STATUS_CONFIG[0];
  return <span className={config.className}>{config.label}</span>;
}

function SlashCard({ label, pct, description, color }: { label: string; pct: string; description: string; color: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-3 transition-all duration-300 hover:border-[#A855F7]/20 hover:bg-[#A855F7]/5">
      <p className={`text-xs font-medium ${color}`}>{label}</p>
      <p className="text-lg font-bold text-white">{pct}</p>
      <p className="text-xs text-white/30">{description}</p>
    </div>
  );
}
