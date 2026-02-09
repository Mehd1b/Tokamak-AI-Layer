'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, type Address } from 'viem';
import { sepolia } from 'wagmi/chains';
import { L1_CONTRACTS } from '@/lib/contracts';

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const WTON_ABI = [
  ...ERC20_ABI,
  {
    name: 'swapFromTON',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tonAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const DEPOSIT_MANAGER_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'layer2', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'requestWithdrawal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'layer2', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'processRequest',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'layer2', type: 'address' },
      { name: 'deposit', type: 'bool' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const SEIG_MANAGER_ABI = [
  {
    name: 'stakeOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'layer2', type: 'address' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const TOKAMAK_LAYER2 = L1_CONTRACTS.layer2;

// Convert TON amount (18 decimals) to WTON amount (27 decimals)
export const toWTONAmount = (tonRawAmount: bigint): bigint => tonRawAmount * 10n ** 9n;

// --- Read hooks ---

export function useTONBalance(address?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.ton,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!address },
  });
}

export function useWTONBalance(address?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wton,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!address },
  });
}

// TON allowance to WTON contract (for swap)
export function useTONAllowance(owner?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.ton,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner ? [owner, L1_CONTRACTS.wton] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!owner },
  });
}

// WTON allowance to DepositManager (for deposit)
export function useWTONAllowance(owner?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wton,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner ? [owner, L1_CONTRACTS.depositManager] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!owner },
  });
}

export function useStakeBalance(address?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.seigManager,
    abi: SEIG_MANAGER_ABI,
    functionName: 'stakeOf',
    args: address ? [TOKAMAK_LAYER2, address] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!address },
  });
}

// --- Write hooks ---

// Step 1: Approve TON to WTON contract (for swap)
export function useApproveTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: string) => {
    writeContract({
      address: L1_CONTRACTS.ton,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [L1_CONTRACTS.wton, parseEther(amount)],
      chainId: sepolia.id,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

// Step 2: Swap TON → WTON
export function useSwapToWTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const swap = (amount: string) => {
    writeContract({
      address: L1_CONTRACTS.wton,
      abi: WTON_ABI,
      functionName: 'swapFromTON',
      args: [parseEther(amount)],
      chainId: sepolia.id,
    });
  };

  return { swap, hash, isPending, isConfirming, isSuccess, error };
}

// Step 3: Approve WTON to DepositManager (for deposit)
export function useApproveWTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: string) => {
    writeContract({
      address: L1_CONTRACTS.wton,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [L1_CONTRACTS.depositManager, toWTONAmount(parseEther(amount))],
      chainId: sepolia.id,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

// Step 4: Deposit WTON to DepositManager
export function useStakeTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const stake = (amount: string) => {
    writeContract({
      address: L1_CONTRACTS.depositManager,
      abi: DEPOSIT_MANAGER_ABI,
      functionName: 'deposit',
      args: [TOKAMAK_LAYER2, toWTONAmount(parseEther(amount))],
      chainId: sepolia.id,
    });
  };

  return { stake, hash, isPending, isConfirming, isSuccess, error };
}

// Unstake: requestWithdrawal (amount in WTON 27 decimals)
export function useUnstakeTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const unstake = (amount: string) => {
    writeContract({
      address: L1_CONTRACTS.depositManager,
      abi: DEPOSIT_MANAGER_ABI,
      functionName: 'requestWithdrawal',
      args: [TOKAMAK_LAYER2, toWTONAmount(parseEther(amount))],
      chainId: sepolia.id,
    });
  };

  return { unstake, hash, isPending, isConfirming, isSuccess, error };
}
