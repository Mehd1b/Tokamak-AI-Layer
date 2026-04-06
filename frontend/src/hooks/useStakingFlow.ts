'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, parseUnits, formatUnits, type Address } from 'viem';
import { mainnet } from 'wagmi/chains';
import { L1_CONTRACTS } from '@/lib/stakingContracts';

// ============ ABIs ============

const ERC20_ABI = [
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const WTON_ABI = [
  ...ERC20_ABI,
  {
    name: 'swapFromTON', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tonAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const WSTON_ABI = [
  {
    name: 'getStakingIndex', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'depositWTONAndGetWSTON', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: '_amount', type: 'uint256' }], outputs: [],
  },
] as const;

const STAKING_ROUTER_ABI = [
  {
    name: 'stakeFromTON', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tonAmount', type: 'uint256' }], outputs: [],
  },
  {
    name: 'stakeFromWTON', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'wtonAmount', type: 'uint256' }], outputs: [],
  },
] as const;

// ============ Types ============

export type StakingMode = 'quick' | 'manual';
export type TokenSource = 'TON' | 'WTON';

export type QuickStakeStep =
  | 'IDLE'
  | 'APPROVING_TOKEN'
  | 'EXECUTING_ROUTER'
  | 'COMPLETE'
  | 'ERROR';

export type ManualStakeStep =
  | 'IDLE'
  | 'APPROVING_TON'
  | 'SWAPPING_WTON'
  | 'APPROVING_WTON'
  | 'DEPOSITING_WSTON'
  | 'COMPLETE'
  | 'ERROR';

export type StakingStep = QuickStakeStep | ManualStakeStep;

export interface StakingBalances {
  ton: bigint | undefined;
  wton: bigint | undefined;
  wston: bigint | undefined;
  stakingIndex: bigint | undefined;
}

export interface StakingFlowResult {
  wstonReceived?: string;
}

export interface UseStakingFlowReturn {
  // State
  step: StakingStep;
  mode: StakingMode;
  tokenSource: TokenSource;
  amount: string;
  balances: StakingBalances;
  isLoading: boolean;
  error: string | null;
  result: StakingFlowResult | null;

  // Actions
  setMode: (mode: StakingMode) => void;
  setTokenSource: (source: TokenSource) => void;
  setAmount: (amount: string) => void;
  execute: () => void;
  retry: () => void;
  reset: () => void;

  // Computed
  estimatedWSTON: string;
  stepLabel: string;
  stepNumber: number;
  totalSteps: number;
  canExecute: boolean;
}

// ============ Constants ============

// Placeholder router address — deploy and replace with actual address
const STAKING_ROUTER_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/** Convert TON amount (18 decimals) to WTON amount (27 decimals) */
const toWTONAmount = (tonRawAmount: bigint): bigint => tonRawAmount * 10n ** 9n;

// ============ Hook ============

export function useStakingFlow(userAddress?: Address): UseStakingFlowReturn {
  const [mode, setMode] = useState<StakingMode>('quick');
  const [tokenSource, setTokenSource] = useState<TokenSource>('TON');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<StakingStep>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StakingFlowResult | null>(null);

  // Track which step we should advance to after tx confirms
  const pendingStepRef = useRef<StakingStep | null>(null);

  // ============ Read: Balances ============

  const { data: tonBalance } = useReadContract({
    address: L1_CONTRACTS.ton, abi: ERC20_ABI, functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined, chainId: mainnet.id,
    query: { enabled: !!userAddress },
  });

  const { data: wtonBalance } = useReadContract({
    address: L1_CONTRACTS.wton, abi: ERC20_ABI, functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined, chainId: mainnet.id,
    query: { enabled: !!userAddress },
  });

  const { data: wstonBalance } = useReadContract({
    address: L1_CONTRACTS.wston, abi: WSTON_ABI, functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined, chainId: mainnet.id,
    query: { enabled: !!userAddress },
  });

  const { data: stakingIndex } = useReadContract({
    address: L1_CONTRACTS.wston, abi: WSTON_ABI, functionName: 'getStakingIndex',
    chainId: mainnet.id,
  });

  // ============ Read: Allowances ============

  // TON allowance for WTON contract (manual flow)
  const { data: tonAllowanceForWton } = useReadContract({
    address: L1_CONTRACTS.ton, abi: ERC20_ABI, functionName: 'allowance',
    args: userAddress ? [userAddress, L1_CONTRACTS.wton] : undefined, chainId: mainnet.id,
    query: { enabled: !!userAddress && mode === 'manual' },
  });

  // WTON allowance for WSTON contract (manual flow)
  const { data: wtonAllowanceForWston } = useReadContract({
    address: L1_CONTRACTS.wton, abi: ERC20_ABI, functionName: 'allowance',
    args: userAddress ? [userAddress, L1_CONTRACTS.wston] : undefined, chainId: mainnet.id,
    query: { enabled: !!userAddress && mode === 'manual' },
  });

  // TON allowance for Router (quick flow)
  const { data: tonAllowanceForRouter } = useReadContract({
    address: L1_CONTRACTS.ton, abi: ERC20_ABI, functionName: 'allowance',
    args: userAddress ? [userAddress, STAKING_ROUTER_ADDRESS] : undefined, chainId: mainnet.id,
    query: { enabled: !!userAddress && mode === 'quick' && tokenSource === 'TON' },
  });

  // WTON allowance for Router (quick flow)
  const { data: wtonAllowanceForRouter } = useReadContract({
    address: L1_CONTRACTS.wton, abi: ERC20_ABI, functionName: 'allowance',
    args: userAddress ? [userAddress, STAKING_ROUTER_ADDRESS] : undefined, chainId: mainnet.id,
    query: { enabled: !!userAddress && mode === 'quick' && tokenSource === 'WTON' },
  });

  const balances: StakingBalances = {
    ton: tonBalance as bigint | undefined,
    wton: wtonBalance as bigint | undefined,
    wston: wstonBalance as bigint | undefined,
    stakingIndex: stakingIndex as bigint | undefined,
  };

  // ============ Write Contracts ============

  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // ============ Computed Values ============

  const parsedAmount = useMemo(() => {
    try {
      if (!amount || parseFloat(amount) <= 0) return 0n;
      if (tokenSource === 'TON') return parseEther(amount);
      return parseUnits(amount, 27);
    } catch {
      return 0n;
    }
  }, [amount, tokenSource]);

  const wtonAmount = useMemo(() => {
    if (tokenSource === 'TON') return toWTONAmount(parsedAmount);
    return parsedAmount;
  }, [parsedAmount, tokenSource]);

  const estimatedWSTON = useMemo(() => {
    if (wtonAmount === 0n || !stakingIndex || (stakingIndex as bigint) === 0n) return '0';
    const wstonRaw = (wtonAmount * 10n ** 27n) / (stakingIndex as bigint);
    return formatUnits(wstonRaw, 27);
  }, [wtonAmount, stakingIndex]);

  // ============ Quick Stake Logic ============

  const needsQuickApproval = useMemo(() => {
    if (parsedAmount === 0n) return false;
    if (tokenSource === 'TON') {
      return !tonAllowanceForRouter || (tonAllowanceForRouter as bigint) < parsedAmount;
    }
    return !wtonAllowanceForRouter || (wtonAllowanceForRouter as bigint) < parsedAmount;
  }, [parsedAmount, tokenSource, tonAllowanceForRouter, wtonAllowanceForRouter]);

  // ============ Manual Stake Logic ============

  const needsTonApproval = useMemo(() => {
    if (tokenSource !== 'TON' || parsedAmount === 0n) return false;
    return !tonAllowanceForWton || (tonAllowanceForWton as bigint) < parsedAmount;
  }, [tokenSource, parsedAmount, tonAllowanceForWton]);

  const needsWtonApproval = useMemo(() => {
    if (wtonAmount === 0n) return false;
    return !wtonAllowanceForWston || (wtonAllowanceForWston as bigint) < wtonAmount;
  }, [wtonAmount, wtonAllowanceForWston]);

  // ============ Step Metadata ============

  const { stepLabel, stepNumber, totalSteps } = useMemo(() => {
    if (mode === 'quick') {
      const total = needsQuickApproval ? 2 : 1;
      switch (step) {
        case 'APPROVING_TOKEN':
          return { stepLabel: `Approving ${tokenSource}...`, stepNumber: 1, totalSteps: total };
        case 'EXECUTING_ROUTER':
          return { stepLabel: 'Staking via router...', stepNumber: needsQuickApproval ? 2 : 1, totalSteps: total };
        case 'COMPLETE':
          return { stepLabel: 'Staking complete!', stepNumber: total, totalSteps: total };
        default:
          return { stepLabel: needsQuickApproval ? `Approve ${tokenSource}` : 'Stake', stepNumber: 1, totalSteps: total };
      }
    }

    // Manual mode
    if (tokenSource === 'TON') {
      const total = (needsTonApproval ? 1 : 0) + 1 + (needsWtonApproval ? 1 : 0) + 1;
      switch (step) {
        case 'APPROVING_TON':
          return { stepLabel: 'Approving TON...', stepNumber: 1, totalSteps: total };
        case 'SWAPPING_WTON':
          return { stepLabel: 'Swapping TON to WTON...', stepNumber: needsTonApproval ? 2 : 1, totalSteps: total };
        case 'APPROVING_WTON':
          return { stepLabel: 'Approving WTON...', stepNumber: total - 1, totalSteps: total };
        case 'DEPOSITING_WSTON':
          return { stepLabel: 'Depositing WTON for WSTON...', stepNumber: total, totalSteps: total };
        case 'COMPLETE':
          return { stepLabel: 'Staking complete!', stepNumber: total, totalSteps: total };
        default: {
          let current = 1;
          if (needsTonApproval) return { stepLabel: 'Approve TON', stepNumber: current, totalSteps: total };
          current++;
          return { stepLabel: 'Swap TON to WTON', stepNumber: current, totalSteps: total };
        }
      }
    } else {
      // WTON source, manual
      const total = (needsWtonApproval ? 1 : 0) + 1;
      switch (step) {
        case 'APPROVING_WTON':
          return { stepLabel: 'Approving WTON...', stepNumber: 1, totalSteps: total };
        case 'DEPOSITING_WSTON':
          return { stepLabel: 'Depositing WTON for WSTON...', stepNumber: total, totalSteps: total };
        case 'COMPLETE':
          return { stepLabel: 'Staking complete!', stepNumber: total, totalSteps: total };
        default:
          return {
            stepLabel: needsWtonApproval ? 'Approve WTON' : 'Deposit',
            stepNumber: 1,
            totalSteps: total,
          };
      }
    }
  }, [mode, step, tokenSource, needsQuickApproval, needsTonApproval, needsWtonApproval]);

  const isLoading = isWritePending || isConfirming;

  const canExecute = parsedAmount > 0n && !isLoading && step !== 'COMPLETE' && step !== 'ERROR';

  // ============ Transaction Confirmation Handler ============

  useEffect(() => {
    if (isConfirmed && pendingStepRef.current) {
      const nextStep = pendingStepRef.current;
      pendingStepRef.current = null;
      setStep(nextStep);

      // If the next step is COMPLETE, set result
      if (nextStep === 'COMPLETE') {
        setResult({ wstonReceived: estimatedWSTON });
      }
    }
  }, [isConfirmed, estimatedWSTON]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      setError(writeError.message?.substring(0, 200) ?? 'Transaction failed');
      setStep('ERROR');
      pendingStepRef.current = null;
    }
  }, [writeError]);

  // ============ Execute Actions ============

  const executeQuickStake = useCallback(() => {
    resetWrite();
    setError(null);

    if (needsQuickApproval) {
      // Step 1: Approve token for router
      setStep('APPROVING_TOKEN');
      pendingStepRef.current = 'EXECUTING_ROUTER';

      if (tokenSource === 'TON') {
        writeContract({
          address: L1_CONTRACTS.ton, abi: ERC20_ABI, functionName: 'approve',
          args: [STAKING_ROUTER_ADDRESS, parsedAmount], chainId: mainnet.id,
        });
      } else {
        writeContract({
          address: L1_CONTRACTS.wton, abi: ERC20_ABI, functionName: 'approve',
          args: [STAKING_ROUTER_ADDRESS, parsedAmount], chainId: mainnet.id,
        });
      }
    } else {
      // Directly execute router
      setStep('EXECUTING_ROUTER');
      pendingStepRef.current = 'COMPLETE';

      if (tokenSource === 'TON') {
        writeContract({
          address: STAKING_ROUTER_ADDRESS, abi: STAKING_ROUTER_ABI, functionName: 'stakeFromTON',
          args: [parsedAmount], chainId: mainnet.id,
        });
      } else {
        writeContract({
          address: STAKING_ROUTER_ADDRESS, abi: STAKING_ROUTER_ABI, functionName: 'stakeFromWTON',
          args: [parsedAmount], chainId: mainnet.id,
        });
      }
    }
  }, [needsQuickApproval, tokenSource, parsedAmount, writeContract, resetWrite]);

  const executeManualStep = useCallback(() => {
    resetWrite();
    setError(null);

    if (tokenSource === 'TON') {
      if (needsTonApproval) {
        setStep('APPROVING_TON');
        pendingStepRef.current = 'SWAPPING_WTON';
        writeContract({
          address: L1_CONTRACTS.ton, abi: ERC20_ABI, functionName: 'approve',
          args: [L1_CONTRACTS.wton, parsedAmount], chainId: mainnet.id,
        });
      } else if (step === 'IDLE' || step === 'APPROVING_TON') {
        setStep('SWAPPING_WTON');
        pendingStepRef.current = needsWtonApproval ? 'APPROVING_WTON' : 'DEPOSITING_WSTON';
        writeContract({
          address: L1_CONTRACTS.wton, abi: WTON_ABI, functionName: 'swapFromTON',
          args: [parsedAmount], chainId: mainnet.id,
        });
      } else if (step === 'SWAPPING_WTON' && needsWtonApproval) {
        setStep('APPROVING_WTON');
        pendingStepRef.current = 'DEPOSITING_WSTON';
        writeContract({
          address: L1_CONTRACTS.wton, abi: ERC20_ABI, functionName: 'approve',
          args: [L1_CONTRACTS.wston, wtonAmount], chainId: mainnet.id,
        });
      } else {
        setStep('DEPOSITING_WSTON');
        pendingStepRef.current = 'COMPLETE';
        writeContract({
          address: L1_CONTRACTS.wston, abi: WSTON_ABI, functionName: 'depositWTONAndGetWSTON',
          args: [wtonAmount], chainId: mainnet.id,
        });
      }
    } else {
      // WTON source
      if (needsWtonApproval) {
        setStep('APPROVING_WTON');
        pendingStepRef.current = 'DEPOSITING_WSTON';
        writeContract({
          address: L1_CONTRACTS.wton, abi: ERC20_ABI, functionName: 'approve',
          args: [L1_CONTRACTS.wston, wtonAmount], chainId: mainnet.id,
        });
      } else {
        setStep('DEPOSITING_WSTON');
        pendingStepRef.current = 'COMPLETE';
        writeContract({
          address: L1_CONTRACTS.wston, abi: WSTON_ABI, functionName: 'depositWTONAndGetWSTON',
          args: [wtonAmount], chainId: mainnet.id,
        });
      }
    }
  }, [tokenSource, needsTonApproval, needsWtonApproval, parsedAmount, wtonAmount, step, writeContract, resetWrite]);

  const execute = useCallback(() => {
    if (parsedAmount === 0n) return;
    if (mode === 'quick') {
      executeQuickStake();
    } else {
      executeManualStep();
    }
  }, [mode, parsedAmount, executeQuickStake, executeManualStep]);

  const retry = useCallback(() => {
    setError(null);
    // Return to IDLE so user can re-initiate from the failed point
    setStep('IDLE');
    resetWrite();
  }, [resetWrite]);

  const reset = useCallback(() => {
    setStep('IDLE');
    setError(null);
    setResult(null);
    setAmount('');
    resetWrite();
  }, [resetWrite]);

  // When mode or tokenSource changes, reset the flow
  useEffect(() => {
    setStep('IDLE');
    setError(null);
    setResult(null);
    resetWrite();
  }, [mode, tokenSource]);

  return {
    step,
    mode,
    tokenSource,
    amount,
    balances,
    isLoading,
    error,
    result,
    setMode,
    setTokenSource,
    setAmount,
    execute,
    retry,
    reset,
    estimatedWSTON,
    stepLabel,
    stepNumber,
    totalSteps,
    canExecute,
  };
}
