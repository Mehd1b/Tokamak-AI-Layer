'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Address } from 'viem';
import { mainnet } from 'wagmi/chains';
import { L1_CONTRACTS } from '@/lib/stakingContracts';

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

const BOND_MANAGER_ABI = [
  {
    name: 'bondToken', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'totalBonded', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'minBondFloor', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'bonds', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'vault', type: 'address' },
      { name: 'nonce', type: 'uint64' },
    ],
    outputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'lockedAt', type: 'uint256' },
      { name: 'status', type: 'uint8' },
    ],
  },
  // Cross-chain version: operator calls lockBond directly
  {
    name: 'lockBond', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'nonce', type: 'uint64' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const BOND_STATUS_LABELS = ['Empty', 'Locked', 'Released', 'Slashed'] as const;
export type BondStatusLabel = (typeof BOND_STATUS_LABELS)[number];

export function bondStatusLabel(status: number): BondStatusLabel {
  return BOND_STATUS_LABELS[status] ?? 'Empty';
}

// ============ Read Hooks ============

export function useWSTONBalanceForBond(address?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wston, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined, chainId: mainnet.id,
    query: { enabled: !!address },
  });
}

export function useWSTONAllowanceForBond(owner?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wston, abi: ERC20_ABI, functionName: 'allowance',
    args: owner ? [owner, L1_CONTRACTS.bondManager] : undefined, chainId: mainnet.id,
    query: { enabled: !!owner },
  });
}

export function useTotalBonded(address?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.bondManager, abi: BOND_MANAGER_ABI, functionName: 'totalBonded',
    args: address ? [address] : undefined, chainId: mainnet.id,
    query: { enabled: !!address },
  });
}

export function useMinBondFloor() {
  return useReadContract({
    address: L1_CONTRACTS.bondManager, abi: BOND_MANAGER_ABI, functionName: 'minBondFloor',
    chainId: mainnet.id,
  });
}

export function useBondInfo(operator?: Address, vault?: Address, nonce?: bigint) {
  return useReadContract({
    address: L1_CONTRACTS.bondManager, abi: BOND_MANAGER_ABI, functionName: 'bonds',
    args: operator && vault && nonce !== undefined ? [operator, vault, nonce] : undefined,
    chainId: mainnet.id,
    query: { enabled: !!operator && !!vault && nonce !== undefined },
  });
}

// ============ Write Hooks ============

export function useApproveWSTONForBond() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const approve = (amount: bigint) => {
    writeContract({
      address: L1_CONTRACTS.wston, abi: ERC20_ABI, functionName: 'approve',
      args: [L1_CONTRACTS.bondManager, amount], chainId: mainnet.id,
    });
  };
  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

export function useLockBond() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const lockBond = (vault: Address, nonce: bigint, amount: bigint) => {
    writeContract({
      address: L1_CONTRACTS.bondManager, abi: BOND_MANAGER_ABI, functionName: 'lockBond',
      args: [vault, nonce, amount], chainId: mainnet.id,
    });
  };
  return { lockBond, hash, isPending, isConfirming, isSuccess, error };
}
