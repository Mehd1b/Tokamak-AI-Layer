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

// Tokamak L2 address on Sepolia (the layer2 parameter for staking calls)
const TOKAMAK_LAYER2 = L1_CONTRACTS.layer2Registry;

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

export function useTONAllowance(owner?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.ton,
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

export function useApproveTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: string) => {
    writeContract({
      address: L1_CONTRACTS.ton,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [L1_CONTRACTS.depositManager, parseEther(amount)],
      chainId: sepolia.id,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

export function useStakeTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const stake = (amount: string) => {
    writeContract({
      address: L1_CONTRACTS.depositManager,
      abi: DEPOSIT_MANAGER_ABI,
      functionName: 'deposit',
      args: [TOKAMAK_LAYER2, parseEther(amount)],
      chainId: sepolia.id,
    });
  };

  return { stake, hash, isPending, isConfirming, isSuccess, error };
}

export function useUnstakeTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const unstake = (amount: string) => {
    writeContract({
      address: L1_CONTRACTS.depositManager,
      abi: DEPOSIT_MANAGER_ABI,
      functionName: 'requestWithdrawal',
      args: [TOKAMAK_LAYER2, parseEther(amount)],
      chainId: sepolia.id,
    });
  };

  return { unstake, hash, isPending, isConfirming, isSuccess, error };
}
