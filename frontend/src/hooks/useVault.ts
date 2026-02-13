'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Address } from 'viem';
import { CONTRACTS, THANOS_CHAIN_ID, L1_CONTRACTS } from '@/lib/contracts';

// ============ ABI ============

const ERC20_ABI = [
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
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const WSTON_VAULT_ABI = [
  {
    name: 'lockedBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getLockedBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'isVerifiedOperator',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getOperatorTier',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'getWithdrawalRequestCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getReadyAmount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'operator', type: 'address' }],
    outputs: [{ name: 'total', type: 'uint256' }],
  },
  {
    name: 'lock',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'requestUnlock',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'processUnlock',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'withdrawalDelay',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'minLockAmount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const TIER_LABELS = ['Unverified', 'Verified', 'Premium'] as const;

// ============ Helpers ============

/** Get vault address — returns undefined if not yet configured */
function getVaultAddress(): Address | undefined {
  const addr = (CONTRACTS as Record<string, string>).wstonVault;
  return addr ? (addr as Address) : undefined;
}

/** Get L2 bridged WSTON address — returns undefined if not yet configured */
function getL2WSTONAddress(): Address | undefined {
  const addr = (CONTRACTS as Record<string, string>).wstonL2;
  return addr ? (addr as Address) : undefined;
}

export function tierLabel(tier: number): string {
  return TIER_LABELS[tier] ?? 'Unknown';
}

// ============ Read Hooks ============

export function useLockedBalance(address?: Address) {
  const vaultAddr = getVaultAddress();
  return useReadContract({
    address: vaultAddr,
    abi: WSTON_VAULT_ABI,
    functionName: 'getLockedBalance',
    args: address ? [address] : undefined,
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!address && !!vaultAddr },
  });
}

export function useVaultTier(address?: Address) {
  const vaultAddr = getVaultAddress();
  return useReadContract({
    address: vaultAddr,
    abi: WSTON_VAULT_ABI,
    functionName: 'getOperatorTier',
    args: address ? [address] : undefined,
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!address && !!vaultAddr },
  });
}

export function useIsVerifiedOperator(address?: Address) {
  const vaultAddr = getVaultAddress();
  return useReadContract({
    address: vaultAddr,
    abi: WSTON_VAULT_ABI,
    functionName: 'isVerifiedOperator',
    args: address ? [address] : undefined,
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!address && !!vaultAddr },
  });
}

export function useVaultWithdrawalRequestCount(address?: Address) {
  const vaultAddr = getVaultAddress();
  return useReadContract({
    address: vaultAddr,
    abi: WSTON_VAULT_ABI,
    functionName: 'getWithdrawalRequestCount',
    args: address ? [address] : undefined,
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!address && !!vaultAddr },
  });
}

export function useVaultReadyAmount(address?: Address) {
  const vaultAddr = getVaultAddress();
  return useReadContract({
    address: vaultAddr,
    abi: WSTON_VAULT_ABI,
    functionName: 'getReadyAmount',
    args: address ? [address] : undefined,
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!address && !!vaultAddr },
  });
}

export function useVaultWithdrawalDelay() {
  const vaultAddr = getVaultAddress();
  return useReadContract({
    address: vaultAddr,
    abi: WSTON_VAULT_ABI,
    functionName: 'withdrawalDelay',
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!vaultAddr },
  });
}

export function useVaultMinLock() {
  const vaultAddr = getVaultAddress();
  return useReadContract({
    address: vaultAddr,
    abi: WSTON_VAULT_ABI,
    functionName: 'minLockAmount',
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!vaultAddr },
  });
}

/** L2 bridged WSTON balance */
export function useL2WSTONBalance(address?: Address) {
  const tokenAddr = getL2WSTONAddress();
  return useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!address && !!tokenAddr },
  });
}

/** L2 WSTON allowance to vault */
export function useL2WSTONAllowance(owner?: Address) {
  const tokenAddr = getL2WSTONAddress();
  const vaultAddr = getVaultAddress();
  return useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner && vaultAddr ? [owner, vaultAddr] : undefined,
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!owner && !!tokenAddr && !!vaultAddr },
  });
}

// ============ Write Hooks ============

/** Approve L2 WSTON spending by vault */
export function useApproveL2WSTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: bigint) => {
    const tokenAddr = getL2WSTONAddress();
    const vaultAddr = getVaultAddress();
    if (!tokenAddr || !vaultAddr) return;
    writeContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [vaultAddr, amount],
      chainId: THANOS_CHAIN_ID,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

/** Lock WSTON in vault */
export function useLockWSTON() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const lock = (amount: bigint) => {
    const vaultAddr = getVaultAddress();
    if (!vaultAddr) return;
    writeContract({
      address: vaultAddr,
      abi: WSTON_VAULT_ABI,
      functionName: 'lock',
      args: [amount],
      chainId: THANOS_CHAIN_ID,
    });
  };

  return { lock, hash, isPending, isConfirming, isSuccess, error };
}

/** Request unlock from vault */
export function useRequestVaultUnlock() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const requestUnlock = (amount: bigint) => {
    const vaultAddr = getVaultAddress();
    if (!vaultAddr) return;
    writeContract({
      address: vaultAddr,
      abi: WSTON_VAULT_ABI,
      functionName: 'requestUnlock',
      args: [amount],
      chainId: THANOS_CHAIN_ID,
    });
  };

  return { requestUnlock, hash, isPending, isConfirming, isSuccess, error };
}

/** Process ready unlocks from vault */
export function useProcessVaultUnlock() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const processUnlock = () => {
    const vaultAddr = getVaultAddress();
    if (!vaultAddr) return;
    writeContract({
      address: vaultAddr,
      abi: WSTON_VAULT_ABI,
      functionName: 'processUnlock',
      chainId: THANOS_CHAIN_ID,
    });
  };

  return { processUnlock, hash, isPending, isConfirming, isSuccess, error };
}

// ============ L2 → L1 Bridge (L2StandardBridge) ============

const L2_STANDARD_BRIDGE_ABI = [
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

function getL2BridgeAddress(): Address {
  return (CONTRACTS as Record<string, string>).l2StandardBridge as Address;
}

/** L2 WSTON allowance to L2StandardBridge */
export function useL2WSTONAllowanceForBridge(owner?: Address) {
  const tokenAddr = getL2WSTONAddress();
  const bridgeAddr = getL2BridgeAddress();
  return useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner && bridgeAddr ? [owner, bridgeAddr] : undefined,
    chainId: THANOS_CHAIN_ID,
    query: { enabled: !!owner && !!tokenAddr && !!bridgeAddr },
  });
}

/** Approve L2 WSTON spending by L2StandardBridge */
export function useApproveL2WSTONForBridge() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: bigint) => {
    const tokenAddr = getL2WSTONAddress();
    const bridgeAddr = getL2BridgeAddress();
    if (!tokenAddr || !bridgeAddr) return;
    writeContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [bridgeAddr, amount],
      chainId: THANOS_CHAIN_ID,
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

/** Bridge WSTON from L2 → L1 via L2StandardBridge.bridgeERC20To */
export function useWithdrawWSTONToL1() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const withdraw = (amount: bigint, recipient: Address) => {
    const l2TokenAddr = getL2WSTONAddress();
    const bridgeAddr = getL2BridgeAddress();
    if (!l2TokenAddr || !bridgeAddr) return;
    writeContract({
      address: bridgeAddr,
      abi: L2_STANDARD_BRIDGE_ABI,
      functionName: 'bridgeERC20To',
      args: [
        l2TokenAddr,
        L1_CONTRACTS.wston,
        recipient,
        amount,
        200000,
        '0x',
      ],
      chainId: THANOS_CHAIN_ID,
    });
  };

  return { withdraw, hash, isPending, isConfirming, isSuccess, error };
}
