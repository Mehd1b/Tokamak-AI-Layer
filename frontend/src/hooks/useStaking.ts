'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, parseUnits, type Address } from 'viem';
import { sepolia } from 'wagmi/chains';
import { L1_CONTRACTS, CONTRACTS } from '@/lib/contracts';

// ============ ABIs ============

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

const WSTON_ABI = [
  {
    name: 'getStakingIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'stakeOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'depositWTONAndGetWSTON',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'requestWithdrawal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_wstonAmount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'claimWithdrawalTotal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'getWithdrawalRequestIndex',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getTotalClaimableAmountByUser',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: 'totalClaimableAmount', type: 'uint256' }],
  },
] as const;

// ============ Helpers ============

/** Convert TON amount (18 decimals) to WTON amount (27 decimals) */
export const toWTONAmount = (tonRawAmount: bigint): bigint => tonRawAmount * 10n ** 9n;

// ============ Read Hooks — Token Balances ============

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

export function useWSTONBalance(address?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wston,
    abi: WSTON_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!address },
  });
}

// ============ Read Hooks — WSTON Contract State ============

export function useStakingIndex() {
  return useReadContract({
    address: L1_CONTRACTS.wston,
    abi: WSTON_ABI,
    functionName: 'getStakingIndex',
    chainId: sepolia.id,
  });
}

export function useTotalStake() {
  return useReadContract({
    address: L1_CONTRACTS.wston,
    abi: WSTON_ABI,
    functionName: 'stakeOf',
    chainId: sepolia.id,
  });
}

// ============ Read Hooks — Allowances ============

/** TON allowance to WTON contract (for TON→WTON swap) */
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

/** WTON allowance to WSTON contract (for deposit) */
export function useWTONAllowanceForWSTON(owner?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wton,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner ? [owner, L1_CONTRACTS.wston] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!owner },
  });
}

// ============ Read Hooks — Withdrawal State ============

export function useClaimableAmount(address?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wston,
    abi: WSTON_ABI,
    functionName: 'getTotalClaimableAmountByUser',
    args: address ? [address] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!address },
  });
}

export function useWithdrawalRequestCount(address?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wston,
    abi: WSTON_ABI,
    functionName: 'getWithdrawalRequestIndex',
    args: address ? [address] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!address },
  });
}

// ============ Write Hooks — TON→WTON Flow ============

/** Approve TON spending by WTON contract (for swap) */
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

/** Swap TON → WTON */
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

// ============ Write Hooks — WSTON Deposit ============

/** Approve WTON spending by WSTON contract (for deposit) */
export function useApproveWTONForWSTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (wtonAmount: bigint) => {
    writeContract({
      address: L1_CONTRACTS.wton,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [L1_CONTRACTS.wston, wtonAmount],
      chainId: sepolia.id,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

/** Deposit WTON into WSTON contract → receive WSTON */
export function useDepositWTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deposit = (wtonAmount: bigint) => {
    writeContract({
      address: L1_CONTRACTS.wston,
      abi: WSTON_ABI,
      functionName: 'depositWTONAndGetWSTON',
      args: [wtonAmount],
      chainId: sepolia.id,
    });
  };

  return { deposit, hash, isPending, isConfirming, isSuccess, error };
}

// ============ Write Hooks — WSTON Withdrawal ============

/** Request withdrawal of WSTON (burns WSTON, queues WTON return) */
export function useRequestWithdrawal() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const requestWithdrawal = (wstonAmount: bigint) => {
    writeContract({
      address: L1_CONTRACTS.wston,
      abi: WSTON_ABI,
      functionName: 'requestWithdrawal',
      args: [wstonAmount],
      chainId: sepolia.id,
    });
  };

  return { requestWithdrawal, hash, isPending, isConfirming, isSuccess, error };
}

/** Claim all ready withdrawals (receive WTON) */
export function useClaimWithdrawal() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claim = () => {
    writeContract({
      address: L1_CONTRACTS.wston,
      abi: WSTON_ABI,
      functionName: 'claimWithdrawalTotal',
      chainId: sepolia.id,
    });
  };

  return { claim, hash, isPending, isConfirming, isSuccess, error };
}

// ============ L1 Standard Bridge — Bridge WSTON L1 → L2 ============

const L1_STANDARD_BRIDGE_ABI = [
  {
    name: 'bridgeERC20To',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_localToken', type: 'address' },
      { name: '_remoteToken', type: 'address' },
      { name: '_to', type: 'address' },
      { name: '_amount', type: 'uint256' },
      { name: '_minGasLimit', type: 'uint32' },
      { name: '_extraData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

/** WSTON allowance to L1StandardBridge */
export function useWSTONAllowanceForBridge(owner?: Address) {
  return useReadContract({
    address: L1_CONTRACTS.wston,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner ? [owner, L1_CONTRACTS.l1StandardBridge] : undefined,
    chainId: sepolia.id,
    query: { enabled: !!owner },
  });
}

/** Approve WSTON spending by L1StandardBridge */
export function useApproveWSTONForBridge() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: bigint) => {
    writeContract({
      address: L1_CONTRACTS.wston,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [L1_CONTRACTS.l1StandardBridge, amount],
      chainId: sepolia.id,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

/** Bridge WSTON from L1 → L2 via L1StandardBridge.bridgeERC20To */
export function useBridgeWSTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const bridge = (amount: bigint, recipient: Address) => {
    const l2WstonAddr = (CONTRACTS as Record<string, string>).wstonL2;
    if (!l2WstonAddr) return;
    writeContract({
      address: L1_CONTRACTS.l1StandardBridge,
      abi: L1_STANDARD_BRIDGE_ABI,
      functionName: 'bridgeERC20To',
      args: [
        L1_CONTRACTS.wston,
        l2WstonAddr as Address,
        recipient,
        amount,
        200000,
        '0x',
      ],
      chainId: sepolia.id,
    });
  };

  return { bridge, hash, isPending, isConfirming, isSuccess, error };
}
