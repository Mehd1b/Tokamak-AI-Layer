'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { ReferralManagerABI } from '@/lib/contracts';
import { useLegacyGas } from '@/hooks/useLegacyGas';
import { keccak256, encodePacked } from 'viem';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

/**
 * Get the ReferralManager address for the current network.
 * Falls back to env var if not in deployment config.
 */
export function useReferralManagerAddress(): `0x${string}` | undefined {
  const { contracts } = useNetwork();
  return (contracts as any).referralManager as `0x${string}` | undefined
    ?? (process.env.NEXT_PUBLIC_REFERRAL_MANAGER as `0x${string}` | undefined);
}

/**
 * Hash a referral code the same way the contract does: keccak256(abi.encodePacked(code))
 */
export function hashReferralCode(code: string): `0x${string}` {
  return keccak256(encodePacked(['string'], [code]));
}

/**
 * Read the caller's referral code hash. Returns bytes32(0) if no code registered.
 */
export function useReferrerCode(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const referralManager = useReferralManagerAddress();

  return useReadContract({
    address: referralManager,
    abi: ReferralManagerABI,
    functionName: 'referrerCode',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!referralManager && !!address },
  });
}

/**
 * Read the referral points for a given address.
 */
export function useReferralPoints(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const referralManager = useReferralManagerAddress();

  return useReadContract({
    address: referralManager,
    abi: ReferralManagerABI,
    functionName: 'referralPoints',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!referralManager && !!address },
  });
}

/**
 * Read the referral count for a given address.
 */
export function useReferralCount(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const referralManager = useReferralManagerAddress();

  return useReadContract({
    address: referralManager,
    abi: ReferralManagerABI,
    functionName: 'referralCount',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!referralManager && !!address },
  });
}

/**
 * Read the points-per-deposit constant.
 */
export function usePointsPerDeposit() {
  const { selectedChainId } = useNetwork();
  const referralManager = useReferralManagerAddress();

  return useReadContract({
    address: referralManager,
    abi: ReferralManagerABI,
    functionName: 'pointsPerDeposit',
    chainId: selectedChainId,
    query: { enabled: !!referralManager },
  });
}

/**
 * Read who referred a depositor.
 */
export function useReferredBy(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const referralManager = useReferralManagerAddress();

  return useReadContract({
    address: referralManager,
    abi: ReferralManagerABI,
    functionName: 'referredBy',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!referralManager && !!address },
  });
}

/**
 * Read the list of all depositors referred by a referrer.
 */
export function useReferrals(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const referralManager = useReferralManagerAddress();

  return useReadContract({
    address: referralManager,
    abi: ReferralManagerABI,
    functionName: 'getReferrals',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!referralManager && !!address },
  });
}

/**
 * Resolve a plaintext code to an address (view call).
 */
export function useResolveCode(code: string | undefined) {
  const { selectedChainId } = useNetwork();
  const referralManager = useReferralManagerAddress();

  return useReadContract({
    address: referralManager,
    abi: ReferralManagerABI,
    functionName: 'resolveCode',
    args: code ? [code] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!referralManager && !!code && code.length > 0 },
  });
}

/**
 * Register a referral code on-chain.
 */
export function useRegisterCode() {
  const referralManager = useReferralManagerAddress();
  const { selectedChainId } = useNetwork();
  const gasOverrides = useLegacyGas();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: selectedChainId,
  });

  const register = (code: string) => {
    if (!referralManager) return;
    writeContract({
      address: referralManager,
      abi: ReferralManagerABI,
      functionName: 'registerCode',
      args: [code],
      chainId: selectedChainId,
      ...gasOverrides,
    });
  };

  return { register, isPending, isConfirming, isSuccess, error, hash };
}

/**
 * Record a referral on-chain (called after a deposit).
 */
export function useRecordReferral() {
  const referralManager = useReferralManagerAddress();
  const { selectedChainId } = useNetwork();
  const gasOverrides = useLegacyGas();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: selectedChainId,
  });

  const record = (depositor: `0x${string}`, codeHash: `0x${string}`) => {
    if (!referralManager) return;
    writeContract({
      address: referralManager,
      abi: ReferralManagerABI,
      functionName: 'recordReferral',
      args: [depositor, codeHash],
      chainId: selectedChainId,
      ...gasOverrides,
    });
  };

  return { record, isPending, isConfirming, isSuccess, error, hash };
}

/**
 * Check if the ReferralManager contract is available on the current network.
 */
export function useReferralAvailable(): boolean {
  const referralManager = useReferralManagerAddress();
  return !!referralManager;
}

export { ZERO_BYTES32, ZERO_ADDRESS };
