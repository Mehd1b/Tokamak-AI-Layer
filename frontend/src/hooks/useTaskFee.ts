'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { type Address, keccak256, encodePacked } from 'viem';
import { CONTRACTS, CHAIN_ID } from '@/lib/contracts';
import { TaskFeeEscrowABI } from '../../../sdk/src/abi/TaskFeeEscrow';

// ============ Utility ============

/**
 * Generate a deterministic taskRef for the escrow contract
 * taskRef = keccak256(abi.encodePacked(agentId, userAddress, nonce))
 */
export function generateTaskRef(agentId: bigint, userAddress: Address, nonce: bigint): `0x${string}` {
  return keccak256(
    encodePacked(
      ['uint256', 'address', 'uint256'],
      [agentId, userAddress, nonce],
    ),
  );
}

// ============ Read Hooks ============

/**
 * Get native TON balance for an address on Thanos L2
 */
export function useTONBalanceL2(address?: Address) {
  return useBalance({
    address,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });
}

/**
 * Get the per-task fee for an agent
 */
export function useAgentFee(agentId?: bigint) {
  return useReadContract({
    address: CONTRACTS.taskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: 'getAgentFee',
    args: agentId !== undefined ? [agentId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: agentId !== undefined },
  });
}

/**
 * Check if a task has been paid for
 */
export function useIsTaskPaid(taskRef?: `0x${string}`) {
  return useReadContract({
    address: CONTRACTS.taskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: 'isTaskPaid',
    args: taskRef ? [taskRef] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!taskRef },
  });
}

/**
 * Get the unclaimed fee balance for an agent
 */
export function useAgentFeeBalance(agentId?: bigint) {
  return useReadContract({
    address: CONTRACTS.taskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: 'getAgentBalance',
    args: agentId !== undefined ? [agentId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: agentId !== undefined },
  });
}

// ============ Write Hooks ============

/**
 * Pay native TON for a task (payable)
 */
export function usePayForTask() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const pay = (agentId: bigint, taskRef: `0x${string}`, feeWei: bigint) => {
    writeContract({
      address: CONTRACTS.taskFeeEscrow,
      abi: TaskFeeEscrowABI,
      functionName: 'payForTask',
      args: [agentId, taskRef],
      value: feeWei,
      chainId: CHAIN_ID,
    });
  };

  return { pay, hash, isPending, isConfirming, isSuccess, error };
}

/**
 * Set the per-task fee for an agent (agent owner only)
 */
export function useSetAgentFee() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const setFee = (agentId: bigint, feePerTask: bigint) => {
    writeContract({
      address: CONTRACTS.taskFeeEscrow,
      abi: TaskFeeEscrowABI,
      functionName: 'setAgentFee',
      args: [agentId, feePerTask],
      chainId: CHAIN_ID,
    });
  };

  return { setFee, hash, isPending, isConfirming, isSuccess, error };
}

/**
 * Claim accumulated fees for an agent (agent owner only)
 */
export function useClaimFees() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claim = (agentId: bigint) => {
    writeContract({
      address: CONTRACTS.taskFeeEscrow,
      abi: TaskFeeEscrowABI,
      functionName: 'claimFees',
      args: [agentId],
      chainId: CHAIN_ID,
    });
  };

  return { claim, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Escrow Refund Hooks ============

/**
 * Read the escrow status for a task
 * Returns: { payer, agentId, amount, paidAt, status }
 * Status: 0=None, 1=Escrowed, 2=Completed, 3=Refunded
 */
export function useTaskEscrow(taskRef?: `0x${string}`) {
  return useReadContract({
    address: CONTRACTS.taskFeeEscrow,
    abi: TaskFeeEscrowABI,
    functionName: 'getTaskEscrow',
    args: taskRef ? [taskRef] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!taskRef },
  });
}

/**
 * Refund escrowed funds for a failed task.
 * Callable by agent owner/operator at any time, or by payer after REFUND_DEADLINE (1 hour).
 */
export function useRefundTask() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const refund = (taskRef: `0x${string}`) => {
    writeContract({
      address: CONTRACTS.taskFeeEscrow,
      abi: TaskFeeEscrowABI,
      functionName: 'refundTask',
      args: [taskRef],
      chainId: CHAIN_ID,
    });
  };

  return { refund, hash, isPending, isConfirming, isSuccess, error };
}
